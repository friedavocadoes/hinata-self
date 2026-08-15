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