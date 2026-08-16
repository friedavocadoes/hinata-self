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
  freightAed?: number;
  warehouseDaysOverride?: number;
  transportCostOverrideAed?: number;
  manualOtherCostAed?: number;
}

export interface PurchaseBatch {
  purchaseItemId: string;
  purchaseNumber: string;
  purchaseOrderId: string;
  quantityAvailableKg: number;
  quantityOriginalKg: number;
  volumeCbm: number;
  receivedAt: string;
  unitExWorksCostAed: number;
  purchaseOrderExWorksCost: number;
  purchaseSharedCost: number;
  storageRateAedPerCbmDay: number;
  inwardClearanceCharge: number;
  inwardBankCharge: number;
  outwardClearanceCharge: number;
  outwardTransportCharge: number;
  freightCharge: number;
  insuranceCharge: number;
  otherExpenseCharge: number;
  financeCharge: number;
}

export interface IncotermCostRule {
  cost_code: string;
  enabled: boolean;
  calculation_type: "manual" | "fixed" | "percentage" | "disabled";
  amount_aed: number;
  rate_pct: number;
  base_code: "ex_works" | "purchase_value" | "sales_value" | "quantity" | "manual" | null;
  multiplier: number;
}

export interface CostingResult {
  quantityKg: number;
  sourcePurchaseCount: number;
  purchaseCost: number;
  purchaseUnitCost: number;
  warehouseDays: number;

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

export interface CostingSettings {
  annual_interest_rate: number;
  customer_da_flat_fee: number;
  customer_lc_flat_fee: number;
  customer_lc_value_pct: number;
  customer_bank_draft_flat_fee: number;
  courier_local_aed: number;
  courier_gcc_aed: number;
  courier_africa_aed: number;
  dwc_surcharge_under_7t: number;
  dwc_surcharge_over_7t: number;
}
