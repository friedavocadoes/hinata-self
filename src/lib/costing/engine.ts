import { CostingInput, CostingResult, CostingSettings, IncotermCostRule, PurchaseBatch } from "./types";

interface TransportRate { rate_aed: number }
interface Vehicle { code: string; capacity_kg: number | null }
interface Destination { code: string; region: string | null }
interface CostingOptions { batches: PurchaseBatch[]; rules: IncotermCostRule[]; settings: CostingSettings; transport?: TransportRate | null; vehicle?: Vehicle | null; destination?: Destination | null }

function round(value: number, decimals = 2) { const factor = 10 ** decimals; return Math.round((value + Number.EPSILON) * factor) / factor; }
function assertFinite(value: number, name: string) { if (!Number.isFinite(value)) throw new Error(`Invalid calculation value: ${name}.`); }
function getRule(rules: IncotermCostRule[], code: string) { return rules.find((rule) => rule.cost_code === code && rule.enabled && rule.calculation_type !== "disabled"); }
function daysBetween(start: string) { const date = new Date(start); if (Number.isNaN(date.getTime())) throw new Error("Invalid purchase receipt date."); return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000)); }

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

function applyRule(rule: IncotermCostRule | undefined, manualValue = 0) {
  if (!rule || !rule.enabled || rule.calculation_type === "disabled") return { fixed: 0, variableRate: 0 };
  if (rule.calculation_type === "manual") return { fixed: manualValue, variableRate: 0 };
  if (rule.calculation_type === "fixed") return { fixed: Number(rule.amount_aed), variableRate: 0 };
  return { fixed: 0, variableRate: Number(rule.rate_pct) * Number(rule.multiplier ?? 1) };
}

function allocateBatch(batch: PurchaseBatch, take: number, warehouseDaysOverride?: number) {
  const ratio = batch.purchaseOrderExWorksCost > 0 ? (batch.unitExWorksCostAed * batch.quantityOriginalKg) / batch.purchaseOrderExWorksCost : 0;
  const sharedPerKg = batch.quantityOriginalKg > 0 ? (batch.purchaseSharedCost * ratio) / batch.quantityOriginalKg : 0;
  const days = warehouseDaysOverride !== undefined ? Math.max(0, warehouseDaysOverride) : daysBetween(batch.receivedAt);
  const storagePerKg = batch.quantityOriginalKg > 0 ? (batch.volumeCbm / batch.quantityOriginalKg) * batch.storageRateAedPerCbmDay * days : 0;
  const scale = batch.quantityOriginalKg > 0 ? take / batch.quantityOriginalKg : 0;
  return {
    days,
    exWorks: batch.unitExWorksCostAed * take,
    inwardClearance: batch.inwardClearanceCharge * ratio * scale,
    inwardBank: batch.inwardBankCharge * ratio * scale,
    outwardClearance: batch.outwardClearanceCharge * ratio * scale,
    outwardTransport: batch.outwardTransportCharge * ratio * scale,
    freight: batch.freightCharge * ratio * scale,
    insurance: batch.insuranceCharge * ratio * scale,
    otherExpense: batch.otherExpenseCharge * ratio * scale,
    finance: batch.financeCharge * ratio * scale,
    storage: storagePerKg * take,
    unitCost: batch.unitExWorksCostAed + sharedPerKg + storagePerKg,
  };
}

export function calculateCosting(input: CostingInput, options: CostingOptions): CostingResult {
  const quantity = Number(input.quantityKg);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be greater than zero.");
  if (!Number.isFinite(input.targetProfitPct) || input.targetProfitPct < 0 || input.targetProfitPct >= 100) throw new Error("Target profit percentage must be between 0 and 99.99.");
  if (input.warehouseDaysOverride !== undefined && (!Number.isFinite(input.warehouseDaysOverride) || input.warehouseDaysOverride < 0)) throw new Error("Warehouse days must be zero or greater.");
  if (input.transportCostOverrideAed !== undefined && (!Number.isFinite(input.transportCostOverrideAed) || input.transportCostOverrideAed < 0)) throw new Error("Transport cost must be zero or greater.");
  if (input.manualOtherCostAed !== undefined && (!Number.isFinite(input.manualOtherCostAed) || input.manualOtherCostAed < 0)) throw new Error("Other cost must be zero or greater.");

  const batches = [...options.batches].filter((b) => Number(b.quantityAvailableKg) > 0).sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  const available = batches.reduce((sum, b) => sum + Number(b.quantityAvailableKg), 0);
  if (available < quantity) throw new Error(`Only ${round(available, 2)} kg of received stock is available for this product.`);

  let remaining = quantity;
  let purchaseCost = 0;
  let exWorksCost = 0;
  let inwardClearance = 0;
  let inwardBankCharge = 0;
  let storageCharge = 0;
  let purchaseOutwardClearance = 0;
  let purchaseOutwardTransport = 0;
  let purchaseFreight = 0;
  let purchaseInsurance = 0;
  let purchaseOtherExpense = 0;
  let purchaseFinance = 0;
  let weightedDays = 0;
  let sourcePurchaseCount = 0;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(batch.quantityAvailableKg));
    if (take <= 0) continue;
    const allocation = allocateBatch(batch, take, input.warehouseDaysOverride);
    remaining -= take;
    sourcePurchaseCount += 1;
    purchaseCost += allocation.unitCost * take;
    exWorksCost += allocation.exWorks;
    inwardClearance += allocation.inwardClearance;
    inwardBankCharge += allocation.inwardBank;
    storageCharge += allocation.storage;
    purchaseOutwardClearance += allocation.outwardClearance;
    purchaseOutwardTransport += allocation.outwardTransport;
    purchaseFreight += allocation.freight;
    purchaseInsurance += allocation.insurance;
    purchaseOtherExpense += allocation.otherExpense;
    purchaseFinance += allocation.finance;
    weightedDays += allocation.days * take;
  }

  const purchaseUnitCost = purchaseCost / quantity;
  const warehouseDays = weightedDays / quantity;
  const outwardClearanceCalc = applyRule(getRule(options.rules, "outward_clearance"));
  const calculatedTransport = input.incoterm === "EXW" ? 0 : transportCost(quantity, options.transport, options.vehicle, options.destination, options.settings);
  const sellingTransport = input.incoterm === "EXW" ? 0 : (input.transportCostOverrideAed ?? calculatedTransport);
  const freightCalc = applyRule(getRule(options.rules, "freight"), Number(input.freightAed ?? 0));
  const insuranceCalc = applyRule(getRule(options.rules, "insurance"));
  const otherExpenseCalc = applyRule(getRule(options.rules, "other_expense"));
  const customsDutyCalc = applyRule(getRule(options.rules, "customs_duty"));
  const customerFinance = customerBankCharge(input.paymentTerm, options.settings);
  const manualOtherCost = Number(input.manualOtherCostAed ?? 0);

  const capitalInterest = purchaseCost * options.settings.annual_interest_rate * (Number(input.creditDays) / 365);
  const fixedSellingCost = outwardClearanceCalc.fixed + sellingTransport + freightCalc.fixed + otherExpenseCalc.fixed + manualOtherCost + capitalInterest + customerFinance.fixed;
  const salesDependentRate = customerFinance.variableRate + insuranceCalc.variableRate + customsDutyCalc.variableRate + otherExpenseCalc.variableRate + outwardClearanceCalc.variableRate + freightCalc.variableRate;
  const denominator = 1 - input.targetProfitPct / 100 - salesDependentRate;
  if (denominator <= 0) throw new Error("The selected margin and configured selling charges produce an invalid selling price.");

  const salesPrice = (purchaseCost + fixedSellingCost) / denominator;
  const sellingInsurance = salesPrice * insuranceCalc.variableRate;
  const variableFinance = salesPrice * customerFinance.variableRate;
  const sellingCustomsDuty = salesPrice * customsDutyCalc.variableRate;
  const sellingOtherExpense = otherExpenseCalc.fixed + salesPrice * otherExpenseCalc.variableRate;
  const sellingOutwardClearance = outwardClearanceCalc.fixed + salesPrice * outwardClearanceCalc.variableRate;
  const sellingFreight = freightCalc.fixed + salesPrice * freightCalc.variableRate;
  const sellingBankFinance = customerFinance.fixed + variableFinance;

  const totalCost = purchaseCost + sellingOutwardClearance + sellingTransport + sellingFreight + sellingInsurance + sellingOtherExpense + sellingCustomsDuty + capitalInterest + sellingBankFinance + manualOtherCost;
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
    sellingTransport,
    manualOtherCostAed: manualOtherCost,
    exWorksCost,
    supplierInvoiceValue: exWorksCost,
    inwardClearance,
    inwardBankCharge,
    storageCharge,
    outwardClearance: purchaseOutwardClearance + sellingOutwardClearance,
    outwardTransport: purchaseOutwardTransport + sellingTransport,
    freight: purchaseFreight + sellingFreight,
    insurance: purchaseInsurance + sellingInsurance,
    otherExpense: purchaseOtherExpense + sellingOtherExpense + manualOtherCost,
    bankFinanceCharge: purchaseFinance + sellingBankFinance,
    capitalInterest,
    customsDuty: sellingCustomsDuty,
    totalCost,
    costPerUnit,
    salesPrice,
    salesUnitPrice,
    profitAmount,
    finalMarginPct,
  };

  for (const [name, value] of Object.entries(result)) if (typeof value === "number") assertFinite(value, name);

  return {
    ...result,
    quantityKg: round(quantity), purchaseCost: round(purchaseCost), purchaseUnitCost: round(purchaseUnitCost, 4), warehouseDays: round(warehouseDays, 2), sellingTransport: round(sellingTransport), manualOtherCostAed: round(manualOtherCost), exWorksCost: round(exWorksCost), supplierInvoiceValue: round(exWorksCost), inwardClearance: round(inwardClearance), inwardBankCharge: round(inwardBankCharge), storageCharge: round(storageCharge), outwardClearance: round(result.outwardClearance), outwardTransport: round(result.outwardTransport), freight: round(result.freight), insurance: round(result.insurance), otherExpense: round(result.otherExpense), bankFinanceCharge: round(result.bankFinanceCharge), capitalInterest: round(capitalInterest), customsDuty: round(sellingCustomsDuty), totalCost: round(totalCost), costPerUnit: round(costPerUnit, 4), salesPrice: round(salesPrice), salesUnitPrice: round(salesUnitPrice, 4), profitAmount: round(profitAmount), finalMarginPct: round(finalMarginPct),
  };
}
