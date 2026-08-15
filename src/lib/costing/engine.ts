import { CostingInput, CostingResult } from "./types";

interface Product {
  cif_rate_usd: number;
  inward_clearance_charge: number;
  storage_rate: number | null;
  storage_days: number;
  default_profit_pct: number;
}

interface Settings {
  usd_to_aed_conversion: number;
  annual_interest_rate: number;
  customs_duty_pct: number;

  tt_bank_flat_fee: number;
  da_bank_fee_pct: number;

  lc_sight_pct: number;
  lc_30_pct: number;
  lc_60_pct: number;
  lc_90_pct: number;
  lc_120_pct: number;

  customer_da_flat_fee: number;
  customer_lc_flat_fee: number;
  customer_lc_value_pct: number;
  customer_bank_draft_flat_fee: number;

  marine_insurance_base_pct: number;
  marine_insurance_cif_multiplier: number;
  marine_insurance_fob_multiplier: number;

  courier_local_aed: number;
  courier_gcc_aed: number;
  courier_africa_aed: number;
}

interface TransportRate {
  rate_aed: number;
}

export function calculateCosting(
  input: CostingInput,
  product: Product,
  settings: Settings,
  transport?: TransportRate
): CostingResult {
  const quantity = input.quantityKg;

  // -------------------------
  // EX-WORKS
  // -------------------------

  const supplierInvoiceValue =
    product.cif_rate_usd *
    settings.usd_to_aed_conversion *
    quantity;

  const exWorksCost = supplierInvoiceValue;

  // -------------------------
  // INWARD CLEARANCE
  // -------------------------

  const inwardClearance =
    product.inward_clearance_charge || 0;

  // -------------------------
  // SUPPLIER BANK CHARGE
  // -------------------------

  let inwardBankCharge = 0;

  switch (input.paymentTerm) {
    case "TT":
      inwardBankCharge = settings.tt_bank_flat_fee;
      break;

    case "DA":
      inwardBankCharge =
        supplierInvoiceValue *
        settings.da_bank_fee_pct;
      break;

    case "LC": {
      const rates: Record<number, number> = {
        0: settings.lc_sight_pct,
        30: settings.lc_30_pct,
        60: settings.lc_60_pct,
        90: settings.lc_90_pct,
        120: settings.lc_120_pct,
      };

      const rate =
        rates[input.creditDays] ??
        settings.lc_sight_pct;

      inwardBankCharge =
        supplierInvoiceValue * rate;

      break;
    }
  }

  // -------------------------
  // STORAGE
  // -------------------------

  const storageCharge =
    (product.storage_rate || 0) *
    (product.storage_days || 0);

  // -------------------------
  // TRANSPORT
  // -------------------------

  const outwardTransport =
    transport?.rate_aed || 0;

  // -------------------------
  // INSURANCE
  // -------------------------

  let insurance = 0;

  if (
    input.incoterm === "CIF" ||
    input.incoterm === "3RD_PORT"
  ) {
    insurance =
      supplierInvoiceValue *
      settings.marine_insurance_base_pct *
      settings.marine_insurance_cif_multiplier;
  }

  if (input.incoterm === "FOB") {
    insurance =
      supplierInvoiceValue *
      settings.marine_insurance_base_pct *
      settings.marine_insurance_fob_multiplier;
  }

  // -------------------------
  // CUSTOMER FINANCE
  // -------------------------

  let bankFinanceCharge = 0;

  switch (input.paymentTerm) {
    case "DA":
      bankFinanceCharge =
        settings.customer_da_flat_fee;
      break;

    case "LC":
      bankFinanceCharge =
        settings.customer_lc_flat_fee;
      break;

    case "BANK_AVALIZED_DRAFT":
      bankFinanceCharge =
        settings.customer_bank_draft_flat_fee;
      break;
  }

  // -------------------------
  // CAPITAL INTEREST
  // -------------------------

  const baseCost =
    exWorksCost +
    inwardClearance +
    inwardBankCharge +
    storageCharge +
    outwardTransport +
    insurance +
    bankFinanceCharge;

  const capitalInterest =
    baseCost *
    settings.annual_interest_rate *
    (input.creditDays / 365);

  // -------------------------
  // CUSTOMS
  // -------------------------

  const customsDuty =
    supplierInvoiceValue *
    settings.customs_duty_pct;

  // -------------------------
  // OTHER EXPENSE
  // -------------------------

  const otherExpense = 0;

  // -------------------------
  // TOTAL
  // -------------------------

  const totalCost =
    baseCost +
    capitalInterest +
    customsDuty +
    otherExpense;

  const costPerUnit =
    totalCost / quantity;

  // -------------------------
  // SELLING PRICE
  // -------------------------

  const salesPrice =
    totalCost /
    (1 - input.targetProfitPct / 100);

  const salesUnitPrice =
    salesPrice / quantity;

  const profitAmount =
    salesPrice - totalCost;

  const finalMarginPct =
    salesPrice === 0
      ? 0
      : (profitAmount / salesPrice) * 100;

  return {
    quantityKg: quantity,

    exWorksCost,
    supplierInvoiceValue,

    inwardClearance,
    inwardBankCharge,
    storageCharge,

    outwardClearance: 0,
    outwardTransport,

    freight: 0,
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
}