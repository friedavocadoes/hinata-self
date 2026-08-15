export interface CostingInput {
  productId: string;
  quantityKg: number;

  deliveryType: "local" | "export";
  destinationId: string;
  incoterm: string;

  paymentTerm: string;
  creditDays: number;

  targetProfitPct: number;

  vehicleType?: string;
}

export interface CostingResult {
  quantityKg: number;

  exWorksCost: number;
  supplierInvoiceValue: number;

  inwardClearance: number;
  inwardBankCharge: number;
  storageCharge: number;

  outwardClearance: number;
  outwardTransport: number;

  freight: number;
  insurance: number;
  otherExpense: number;

  bankFinanceCharge: number;
  capitalInterest: number;
  customsDuty: number;

  totalCost: number;
  costPerUnit: number;

  salesPrice: number;
  salesUnitPrice: number;

  profitAmount: number;
  finalMarginPct: number;
}

export interface CostingProduct {
  cif_rate_usd: number;
  inward_clearance_charge: number;
  storage_rate: number | null;
  storage_days: number;
  default_profit_pct: number;
}

export interface CostingSettings {
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

  dwc_surcharge_under_7t: number;
  dwc_surcharge_over_7t: number;
}