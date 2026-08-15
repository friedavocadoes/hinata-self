import {
  CostingInput,
  CostingProduct,
  CostingResult,
  CostingSettings,
} from "./types";

interface TransportRate {
  rate_aed: number;
}

interface CostingOptions {
  product: CostingProduct;
  settings: CostingSettings;
  transport?: TransportRate | null;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function getLcRate(
  creditDays: number,
  settings: CostingSettings,
) {
  if (creditDays >= 120) {
    return settings.lc_120_pct;
  }

  if (creditDays >= 90) {
    return settings.lc_90_pct;
  }

  if (creditDays >= 60) {
    return settings.lc_60_pct;
  }

  if (creditDays >= 30) {
    return settings.lc_30_pct;
  }

  return settings.lc_sight_pct;
}

function getSupplierBankCharge(
  paymentTerm: string,
  supplierInvoiceValue: number,
  creditDays: number,
  settings: CostingSettings,
) {
  switch (paymentTerm) {
    case "TT":
      return settings.tt_bank_flat_fee;

    case "DA":
      return supplierInvoiceValue * settings.da_bank_fee_pct;

    case "LC":
      return (
        supplierInvoiceValue *
        getLcRate(creditDays, settings)
      );

    default:
      return 0;
  }
}

function getCustomerBankCharge(
  paymentTerm: string,
  salesValue: number,
  settings: CostingSettings,
) {
  switch (paymentTerm) {
    case "DA":
      return settings.customer_da_flat_fee;

    case "LC":
      return (
        settings.customer_lc_flat_fee +
        salesValue * settings.customer_lc_value_pct
      );

    case "BANK_AVALIZED_DRAFT":
      return settings.customer_bank_draft_flat_fee;

    default:
      return 0;
  }
}

function getInsuranceRate(
  incoterm: string,
  settings: CostingSettings,
) {
  if (
    incoterm === "CIF" ||
    incoterm === "3RD_PORT"
  ) {
    return (
      settings.marine_insurance_base_pct *
      settings.marine_insurance_cif_multiplier
    );
  }

  if (incoterm === "FOB") {
    return (
      settings.marine_insurance_base_pct *
      settings.marine_insurance_fob_multiplier
    );
  }

  return 0;
}

function getCourierExpense(
  paymentTerm: string,
  deliveryType: "local" | "export",
  settings: CostingSettings,
) {
  if (paymentTerm !== "TT") {
    return 0;
  }

  if (deliveryType === "local") {
    return settings.courier_local_aed;
  }

  return 0;
}

export function calculateCosting(
  input: CostingInput,
  options: CostingOptions,
): CostingResult {
  const {
    product,
    settings,
    transport,
  } = options;

  const quantity = input.quantityKg;

  if (quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }

  if (
    input.targetProfitPct < 0 ||
    input.targetProfitPct >= 100
  ) {
    throw new Error(
      "Target profit percentage must be between 0 and 99.99.",
    );
  }

  // ----------------------------------------
  // SUPPLIER INVOICE / EX-WORKS
  // ----------------------------------------

  const supplierInvoiceValue =
    product.cif_rate_usd *
    settings.usd_to_aed_conversion *
    quantity;

  const exWorksCost = supplierInvoiceValue;

  // ----------------------------------------
  // INWARD COSTS
  // ----------------------------------------

  const inwardClearance =
    product.inward_clearance_charge || 0;

  const inwardBankCharge =
    getSupplierBankCharge(
      input.paymentTerm,
      supplierInvoiceValue,
      input.creditDays,
      settings,
    );

  const storageCharge =
    (product.storage_rate || 0) *
    (product.storage_days || 0);

  // ----------------------------------------
  // LOGISTICS
  // ----------------------------------------

  const outwardTransport =
    transport?.rate_aed || 0;

  const outwardClearance = 0;
  const freight = 0;

  // ----------------------------------------
  // CUSTOMS
  // ----------------------------------------

  const customsDuty =
    supplierInvoiceValue *
    settings.customs_duty_pct;

  // ----------------------------------------
  // OTHER EXPENSES
  // ----------------------------------------

  const otherExpense =
    getCourierExpense(
      input.paymentTerm,
      input.deliveryType,
      settings,
    );

  // ----------------------------------------
  // COSTS NOT DEPENDENT ON SALES VALUE
  // ----------------------------------------

  const fixedCost =
    exWorksCost +
    inwardClearance +
    inwardBankCharge +
    storageCharge +
    outwardClearance +
    outwardTransport +
    freight +
    customsDuty +
    otherExpense;

  // ----------------------------------------
  // SALES-VALUE-DEPENDENT COSTS
  //
  // Insurance = insuranceRate × Sales
  // LC finance = flatFee + lcValuePct × Sales
  // Interest = fixedCost × annualRate × days/365
  // ----------------------------------------

  const capitalInterest =
    fixedCost *
    settings.annual_interest_rate *
    (input.creditDays / 365);

  const fixedFinanceCharge =
    input.paymentTerm === "DA"
      ? settings.customer_da_flat_fee
      : input.paymentTerm === "LC"
        ? settings.customer_lc_flat_fee
        : input.paymentTerm ===
            "BANK_AVALIZED_DRAFT"
          ? settings.customer_bank_draft_flat_fee
          : 0;

  const salesDependentFinanceRate =
    input.paymentTerm === "LC"
      ? settings.customer_lc_value_pct
      : 0;

  const insuranceRate =
    getInsuranceRate(
      input.incoterm,
      settings,
    );

  /*
   * Sales Price formula:
   *
   * Sales = Total Cost / (1 - margin)
   *
   * Total Cost =
   *   fixedCost
   *   + capitalInterest
   *   + fixedFinanceCharge
   *   + insuranceRate × Sales
   *   + financeRate × Sales
   *
   * Therefore:
   *
   * Sales × (1 - margin - insuranceRate - financeRate)
   *   =
   * fixedCost + capitalInterest + fixedFinanceCharge
   */

  const baseAmount =
    fixedCost +
    capitalInterest +
    fixedFinanceCharge;

  const denominator =
    1 -
    input.targetProfitPct / 100 -
    insuranceRate -
    salesDependentFinanceRate;

  if (denominator <= 0) {
    throw new Error(
      "The selected margin and finance/insurance rates produce an invalid selling price.",
    );
  }

  const salesPrice =
    baseAmount / denominator;

  const insurance =
    salesPrice * insuranceRate;

  const bankFinanceCharge =
    fixedFinanceCharge +
    salesPrice *
      salesDependentFinanceRate;

  const totalCost =
    baseAmount +
    insurance +
    salesPrice *
      salesDependentFinanceRate;

  const costPerUnit =
    totalCost / quantity;

  const salesUnitPrice =
    salesPrice / quantity;

  const profitAmount =
    salesPrice - totalCost;

  const finalMarginPct =
    salesPrice === 0
      ? 0
      : (profitAmount / salesPrice) * 100;

  return {
    quantityKg: round(quantity),

    exWorksCost: round(exWorksCost),
    supplierInvoiceValue: round(
      supplierInvoiceValue,
    ),

    inwardClearance: round(
      inwardClearance,
    ),

    inwardBankCharge: round(
      inwardBankCharge,
    ),

    storageCharge: round(
      storageCharge,
    ),

    outwardClearance: round(
      outwardClearance,
    ),

    outwardTransport: round(
      outwardTransport,
    ),

    freight: round(freight),

    insurance: round(insurance),

    otherExpense: round(otherExpense),

    bankFinanceCharge: round(
      bankFinanceCharge,
    ),

    capitalInterest: round(
      capitalInterest,
    ),

    customsDuty: round(customsDuty),

    totalCost: round(totalCost),

    costPerUnit: round(
      costPerUnit,
      4,
    ),

    salesPrice: round(salesPrice),

    salesUnitPrice: round(
      salesUnitPrice,
      4,
    ),

    profitAmount: round(
      profitAmount,
    ),

    finalMarginPct: round(
      finalMarginPct,
      4,
    ),
  };
}