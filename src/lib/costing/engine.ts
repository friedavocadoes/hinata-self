import { CostingInput, CostingResult, CostingSettings, IncotermCostRule, PurchaseBatch } from "./types";

interface TransportRate { rate_aed: number }
interface Vehicle { code: string; capacity_kg: number | null }
interface Destination { code: string; region: string | null }

interface CostingOptions {
  batches: PurchaseBatch[];
  rules: IncotermCostRule[];
  settings: CostingSettings;
  transport?: TransportRate | null;
  vehicle?: Vehicle | null;
  destination?: Destination | null;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function assertFinite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new Error(`Invalid calculation value: ${name}.`);
}

function getRule(rules: IncotermCostRule[], code: string) {
  return rules.find((rule) => rule.cost_code === code && rule.enabled && rule.calculation_type !== "disabled");
}

function daysBetween(start: string) {
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) throw new Error("Invalid purchase receipt date.");
  return Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86400000));
}

function transportCost(quantityKg: number, transport: TransportRate | null | undefined, vehicle: Vehicle | null | undefined, destination: Destination | null | undefined, settings: CostingSettings) {
  if (!transport || !vehicle) return 0;
  const tripCount = vehicle.capacity_kg && vehicle.capacity_kg > 0 ? Math.ceil(quantityKg / vehicle.capacity_kg) : 1;
  let total = Number(transport.rate_aed) * tripCount;
  if (destination?.code === "DWC") {
    if (vehicle.capacity_kg !== null && vehicle.capacity_kg < 7000) total += settings.dwc_surcharge_under_7t * tripCount;
    if (vehicle.capacity_kg !== null && vehicle.capacity_kg > 7000) total += settings.dwc_surcharge_over_7t * tripCount;
  }
  return total;
}

function customerBankCharge(paymentTerm: string, settings: CostingSettings) {
  if (paymentTerm === "DA") return { fixed: settings.customer_da_flat_fee, variableRate: 0 };
  if (paymentTerm === "LC") return { fixed: settings.customer_lc_flat_fee, variableRate: settings.customer_lc_value_pct };
  if (paymentTerm === "BANK_AVALIZED_DRAFT") return { fixed: settings.customer_bank_draft_flat_fee, variableRate: 0 };
  return { fixed: 0, variableRate: 0 };
}

function applyRule(rule: IncotermCostRule | undefined, base: number, manualValue = 0) {
  if (!rule || !rule.enabled || rule.calculation_type === "disabled") return { fixed: 0, variableRate: 0, value: 0 };
  if (rule.calculation_type === "manual") return { fixed: manualValue, variableRate: 0, value: manualValue };
  if (rule.calculation_type === "fixed") return { fixed: Number(rule.amount_aed), variableRate: 0, value: Number(rule.amount_aed) };
  const rate = Number(rule.rate_pct) * Number(rule.multiplier ?? 1);
  return { fixed: 0, variableRate: rate, value: base * rate };
}

function allocatePurchaseBatch(batch: PurchaseBatch, quantityKg: number) {
  const take = Math.min(quantityKg, batch.quantityAvailableKg);
  const allocationRatio = batch.purchaseOrderExWorksCost > 0
    ? (batch.unitExWorksCostAed * batch.quantityOriginalKg) / batch.purchaseOrderExWorksCost
    : batch.quantityOriginalKg > 0 ? 1 : 0;
  const allocatedSharedTotal = batch.purchaseSharedCost * allocationRatio;
  const sharedPerKg = batch.quantityOriginalKg > 0 ? allocatedSharedTotal / batch.quantityOriginalKg : 0;
  const days = daysBetween(batch.receivedAt);
  const storagePerKg = batch.quantityOriginalKg > 0
    ? (batch.volumeCbm / batch.quantityOriginalKg) * batch.storageRateAedPerCbmDay * days
    : 0;
  const unitCost = batch.unitExWorksCostAed + sharedPerKg + storagePerKg;
  return {
    take,
    days,
    unitCost,
    exWorks: batch.unitExWorksCostAed * take,
    shared: sharedPerKg * take,
    storage: storagePerKg * take,
  };
}

export function calculateCosting(input: CostingInput, options: CostingOptions): CostingResult {
  const quantity = Number(input.quantityKg);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be greater than zero.");
  if (!Number.isFinite(input.targetProfitPct) || input.targetProfitPct < 0 || input.targetProfitPct >= 100) throw new Error("Target profit percentage must be between 0 and 99.99.");

  const batches = [...options.batches]
    .filter((batch) => Number(batch.quantityAvailableKg) > 0)
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

  const totalAvailable = batches.reduce((sum, batch) => sum + Number(batch.quantityAvailableKg), 0);
  if (totalAvailable < quantity) throw new Error(`Only ${round(totalAvailable, 2)} kg of received stock is available for this product.`);

  let remaining = quantity;
  let purchaseCost = 0;
  let exWorksCost = 0;
  let sharedCost = 0;
  let storageCharge = 0;
  let weightedDays = 0;
  let sourcePurchaseCount = 0;
  let purchaseUnitCost = 0;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const allocation = allocatePurchaseBatch(batch, remaining);
    if (allocation.take <= 0) continue;
    sourcePurchaseCount += 1;
    remaining -= allocation.take;
    purchaseCost += allocation.unitCost * allocation.take;
    purchaseUnitCost += allocation.unitCost * allocation.take;
    exWorksCost += allocation.exWorks;
    sharedCost += allocation.shared;
    storageCharge += allocation.storage;
    weightedDays += allocation.days * allocation.take;
  }

  purchaseUnitCost /= quantity;
  const warehouseDays = weightedDays / quantity;

  const inwardClearance = sharedCost > 0 ? 0 : 0;
  const purchaseRules = options.rules;
  const outwardClearanceRule = getRule(purchaseRules, "outward_clearance");
  const outwardTransportRule = getRule(purchaseRules, "outward_transport");
  const freightRule = getRule(purchaseRules, "freight");
  const insuranceRule = getRule(purchaseRules, "insurance");
  const otherExpenseRule = getRule(purchaseRules, "other_expense");
  const customsDutyRule = getRule(purchaseRules, "customs_duty");

  const outwardClearanceCalc = applyRule(outwardClearanceRule, purchaseCost);
  const outwardTransportCalc = outwardTransportRule
    ? { fixed: transportCost(quantity, options.transport, options.vehicle, options.destination, options.settings), variableRate: 0, value: transportCost(quantity, options.transport, options.vehicle, options.destination, options.settings) }
    : { fixed: 0, variableRate: 0, value: 0 };
  const freightCalc = applyRule(freightRule, purchaseCost, Number(input.freightAed ?? 0));
  const otherExpenseCalc = applyRule(otherExpenseRule, purchaseCost);
  const customsDutyCalc = applyRule(customsDutyRule, purchaseCost);

  const customerFinance = customerBankCharge(input.paymentTerm, options.settings);
  const insuranceCalc = applyRule(insuranceRule, 0);
  const fixedFinanceCharge = customerFinance.fixed;

  const capitalInterest = purchaseCost * options.settings.annual_interest_rate * (Number(input.creditDays) / 365);
  const fixedSellingCost =
    outwardClearanceCalc.fixed +
    outwardTransportCalc.fixed +
    freightCalc.fixed +
    otherExpenseCalc.fixed +
    customsDutyCalc.fixed +
    capitalInterest +
    fixedFinanceCharge;

  const salesDependentRate =
    customerFinance.variableRate +
    insuranceCalc.variableRate +
    customsDutyCalc.variableRate +
    otherExpenseCalc.variableRate +
    outwardClearanceCalc.variableRate +
    freightCalc.variableRate +
    outwardTransportCalc.variableRate;

  const targetMargin = input.targetProfitPct / 100;
  const denominator = 1 - targetMargin - salesDependentRate;
  if (denominator <= 0) throw new Error("The selected margin and configured selling charges produce an invalid selling price.");

  const salesPrice = (purchaseCost + fixedSellingCost) / denominator;
  const insurance = salesPrice * insuranceCalc.variableRate;
  const variableFinance = salesPrice * customerFinance.variableRate;
  const customsDuty = salesPrice * customsDutyCalc.variableRate;
  const otherExpense = otherExpenseCalc.fixed + salesPrice * otherExpenseCalc.variableRate;
  const outwardClearance = outwardClearanceCalc.fixed + salesPrice * outwardClearanceCalc.variableRate;
  const freight = freightCalc.fixed + salesPrice * freightCalc.variableRate;
  const outwardTransport = outwardTransportCalc.value + salesPrice * outwardTransportCalc.variableRate;
  const bankFinanceCharge = fixedFinanceCharge + variableFinance;

  const totalCost =
    purchaseCost +
    outwardClearance +
    outwardTransport +
    freight +
    insurance +
    otherExpense +
    customsDuty +
    capitalInterest +
    bankFinanceCharge;

  const costPerUnit = totalCost / quantity;
  const salesUnitPrice = salesPrice / quantity;
  const profitAmount = salesPrice - totalCost;
  const finalMarginPct = salesPrice === 0 ? 0 : (profitAmount / salesPrice) * 100;

  const result = {
    quantityKg: quantity,
    sourcePurchaseCount,
    purchaseCost,
    purchaseUnitCost,
    warehouseDays,
    exWorksCost,
    supplierInvoiceValue: exWorksCost,
    inwardClearance,
    inwardBankCharge: 0,
    storageCharge,
    outwardClearance,
    outwardTransport,
    freight,
    insurance,
    otherExpense,
    bankFinanceCharge,
    capitalInterest,
    customsDuty,
    totalCost,
    costPerUnit,
    salesPrice,
    salesUnitPrice,
    profitAmount,
    finalMarginPct,
  };

  for (const [name, value] of Object.entries(result)) {
    if (typeof value === "number") assertFinite(value, name);
  }

  return {
    ...result,
    quantityKg: round(result.quantityKg),
    purchaseCost: round(result.purchaseCost),
    purchaseUnitCost: round(result.purchaseUnitCost, 4),
    warehouseDays: round(result.warehouseDays, 2),
    exWorksCost: round(result.exWorksCost),
    supplierInvoiceValue: round(result.supplierInvoiceValue),
    inwardClearance: round(result.inwardClearance),
    inwardBankCharge: round(result.inwardBankCharge),
    storageCharge: round(result.storageCharge),
    outwardClearance: round(result.outwardClearance),
    outwardTransport: round(result.outwardTransport),
    freight: round(result.freight),
    insurance: round(result.insurance),
    otherExpense: round(result.otherExpense),
    bankFinanceCharge: round(result.bankFinanceCharge),
    capitalInterest: round(result.capitalInterest),
    customsDuty: round(result.customsDuty),
    totalCost: round(result.totalCost),
    costPerUnit: round(result.costPerUnit, 4),
    salesPrice: round(result.salesPrice),
    salesUnitPrice: round(result.salesUnitPrice, 4),
    profitAmount: round(result.profitAmount),
    finalMarginPct: round(result.finalMarginPct, 4),
  };
}
