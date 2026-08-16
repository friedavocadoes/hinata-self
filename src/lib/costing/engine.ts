import {
  CostingInput,
  CostingProduct,
  CostingResult,
  CostingSettings,
} from "./types";

interface TransportRate {
  rate_aed: number;
}

interface Vehicle {
  code: string;
  capacity_kg: number | null;
}

interface Destination {
  code: string;
  region: string | null;
}

interface CostingOptions {
  product: CostingProduct;
  settings: CostingSettings;

  transport?: TransportRate | null;

  vehicle?: Vehicle | null;

  destination?: Destination | null;
}

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function round(
  value: number,
  decimals = 2,
) {
  const factor = 10 ** decimals;

  return (
    Math.round(
      (value + Number.EPSILON) *
        factor,
    ) / factor
  );
}

function assertFinite(
  value: number,
  name: string,
) {
  if (!Number.isFinite(value)) {
    throw new Error(
      `Invalid calculation value: ${name}.`,
    );
  }
}

/*
 * ============================================================
 * LC RATE
 * ============================================================
 */

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

/*
 * ============================================================
 * SUPPLIER BANK CHARGE
 * ============================================================
 *
 * IMPORTANT:
 * This uses supplier MOP / supplier credit days.
 * It must NOT use the customer's payment term.
 */

function getSupplierBankCharge(
  paymentTerm: string | null,
  supplierInvoiceValue: number,
  supplierCreditDays: number,
  settings: CostingSettings,
) {
  switch (paymentTerm) {
    case "TT":
      return settings.tt_bank_flat_fee;

    case "DA":
      return (
        supplierInvoiceValue *
        settings.da_bank_fee_pct
      );

    case "LC":
      return (
        supplierInvoiceValue *
        getLcRate(
          supplierCreditDays,
          settings,
        )
      );

    default:
      return 0;
  }
}

/*
 * ============================================================
 * CUSTOMER BANK CHARGE
 * ============================================================
 */

function getCustomerBankCharge(
  paymentTerm: string,
  salesValue: number,
  settings: CostingSettings,
) {
  switch (paymentTerm) {
    case "DA":
      return (
        settings.customer_da_flat_fee
      );

    case "LC":
      return (
        settings.customer_lc_flat_fee +
        salesValue *
          settings.customer_lc_value_pct
      );

    case "BANK_AVALIZED_DRAFT":
      return (
        settings.customer_bank_draft_flat_fee
      );

    default:
      return 0;
  }
}

/*
 * ============================================================
 * INSURANCE
 * ============================================================
 */

function getInsuranceRate(
  incoterm: string,
  settings: CostingSettings,
) {
  switch (incoterm) {
    case "CIF":
    case "3RD_PORT":
      return (
        settings.marine_insurance_base_pct *
        settings.marine_insurance_cif_multiplier
      );

    case "FOB":
      return (
        settings.marine_insurance_base_pct *
        settings.marine_insurance_fob_multiplier
      );

    default:
      return 0;
  }
}

/*
 * ============================================================
 * COURIER
 * ============================================================
 */

function getCourierExpense(
  paymentTerm: string,
  destinationRegion:
    | string
    | null
    | undefined,
  deliveryType:
    | "local"
    | "export",
  settings: CostingSettings,
) {
  if (paymentTerm !== "TT") {
    return 0;
  }

  if (deliveryType === "local") {
    return settings.courier_local_aed;
  }

  switch (destinationRegion) {
    case "gcc":
      return settings.courier_gcc_aed;

    case "africa":
      return settings.courier_africa_aed;

    default:
      return 0;
  }
}

/*
 * ============================================================
 * TRANSPORT
 * ============================================================
 */

function getTransportCost(
  quantityKg: number,
  transportRate:
    | TransportRate
    | null
    | undefined,
  vehicle:
    | Vehicle
    | null
    | undefined,
  destinationCode:
    | string
    | null
    | undefined,
  settings: CostingSettings,
) {
  if (!transportRate) {
    return {
      transportCost: 0,
      tripCount: 0,
    };
  }

  if (!vehicle) {
    throw new Error(
      "Vehicle information is required for transport calculation.",
    );
  }

  /*
   * Trailer currently has no capacity in the DB.
   *
   * Until its real capacity is configured,
   * treat the selected trailer as one shipment.
   */

  let tripCount = 1;

  if (
    vehicle.capacity_kg !== null
  ) {
    if (
      vehicle.capacity_kg <= 0
    ) {
      throw new Error(
        "Vehicle capacity must be greater than zero.",
      );
    }

    tripCount = Math.ceil(
      quantityKg /
        vehicle.capacity_kg,
    );
  }

  let transportCost =
    transportRate.rate_aed *
    tripCount;

  /*
   * DWC surcharge.
   *
   * The business settings contain separate
   * under-7T and over-7T charges.
   */

  if (
    destinationCode === "DWC"
  ) {
    const capacity =
      vehicle.capacity_kg;

    if (
      capacity !== null &&
      capacity < 7000
    ) {
      transportCost +=
        settings.dwc_surcharge_under_7t *
        tripCount;
    }

    if (
      capacity !== null &&
      capacity > 7000
    ) {
      transportCost +=
        settings.dwc_surcharge_over_7t *
        tripCount;
    }
  }

  return {
    transportCost,
    tripCount,
  };
}

/*
 * ============================================================
 * MAIN COSTING ENGINE
 * ============================================================
 */

export function calculateCosting(
  input: CostingInput,
  options: CostingOptions,
): CostingResult {
  const {
    product,
    settings,
    transport,
    vehicle,
    destination,
  } = options;

  const quantity =
    Number(input.quantityKg);

  /*
   * ----------------------------------------------------------
   * VALIDATION
   * ----------------------------------------------------------
   */

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    throw new Error(
      "Quantity must be greater than zero.",
    );
  }

  if (
    !Number.isFinite(
      input.targetProfitPct,
    ) ||
    input.targetProfitPct < 0 ||
    input.targetProfitPct >= 100
  ) {
    throw new Error(
      "Target profit percentage must be between 0 and 99.99.",
    );
  }

  /*
   * ----------------------------------------------------------
   * SUPPLIER INVOICE
   * ----------------------------------------------------------
   */

  const supplierInvoiceValue =
    Number(product.cif_rate_usd) *
    Number(
      settings.usd_to_aed_conversion,
    ) *
    quantity;

  const exWorksCost =
    supplierInvoiceValue;

  /*
   * ----------------------------------------------------------
   * INWARD COSTS
   * ----------------------------------------------------------
   */

  const inwardClearance =
    Number(
      product.inward_clearance_charge ??
        0,
    );

  /*
   * IMPORTANT:
   * Supplier-side MOP comes from the product.
   */

  const inwardBankCharge =
    getSupplierBankCharge(
      product.supplier_mop,
      supplierInvoiceValue,
      Number(
        product.supplier_credit_days ??
          0,
      ),
      settings,
    );

  const storageCharge =
    Number(
      product.storage_rate ?? 0,
    ) *
    Number(
      product.storage_days ?? 0,
    );

  /*
   * ----------------------------------------------------------
   * TRANSPORT
   * ----------------------------------------------------------
   */

  const {
    transportCost:
      outwardTransport,
  } = getTransportCost(
    quantity,
    transport,
    vehicle,
    destination?.code,
    settings,
  );

  const outwardClearance = 0;

  const freight = 0;

  /*
   * ----------------------------------------------------------
   * CUSTOMS
   * ----------------------------------------------------------
   */

  const customsDuty =
    supplierInvoiceValue *
    Number(
      settings.customs_duty_pct,
    );

  /*
   * ----------------------------------------------------------
   * OTHER EXPENSES
   * ----------------------------------------------------------
   */

  const otherExpense =
    getCourierExpense(
      input.paymentTerm,
      destination?.region,
      input.deliveryType,
      settings,
    );

  /*
   * ----------------------------------------------------------
   * FIXED COST
   * ----------------------------------------------------------
   */

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

  /*
   * ----------------------------------------------------------
   * CAPITAL INTEREST
   * ----------------------------------------------------------
   *
   * This remains based on customer credit period because
   * this represents the financing exposure created by the
   * customer transaction.
   */

  const capitalInterest =
    fixedCost *
    settings.annual_interest_rate *
    (input.creditDays / 365);

  /*
   * ----------------------------------------------------------
   * CUSTOMER BANK FINANCE
   * ----------------------------------------------------------
   */

  const fixedFinanceCharge =
    getCustomerBankCharge(
      input.paymentTerm,
      0,
      settings,
    );

  /*
   * getCustomerBankCharge(0) gives us only the fixed portion
   * for LC/DA/draft.
   */

  const salesDependentFinanceRate =
    input.paymentTerm === "LC"
      ? settings.customer_lc_value_pct
      : 0;

  /*
   * ----------------------------------------------------------
   * INSURANCE
   * ----------------------------------------------------------
   */

  const insuranceRate =
    getInsuranceRate(
      input.incoterm,
      settings,
    );

  /*
   * ----------------------------------------------------------
   * SOLVE SELLING PRICE
   * ----------------------------------------------------------
   *
   * Sales =
   *
   * Base Cost /
   * (
   *   1
   *   - target margin
   *   - insurance rate
   *   - customer finance rate
   * )
   */

  const baseAmount =
    fixedCost +
    capitalInterest +
    fixedFinanceCharge;

  const targetMargin =
    input.targetProfitPct / 100;

  const denominator =
    1 -
    targetMargin -
    insuranceRate -
    salesDependentFinanceRate;

  if (
    denominator <= 0
  ) {
    throw new Error(
      "The selected margin and finance/insurance rates produce an invalid selling price.",
    );
  }

  const salesPrice =
    baseAmount /
    denominator;

  /*
   * ----------------------------------------------------------
   * SALES-DEPENDENT COSTS
   * ----------------------------------------------------------
   */

  const insurance =
    salesPrice *
    insuranceRate;

  const variableFinanceCharge =
    salesPrice *
    salesDependentFinanceRate;

  const bankFinanceCharge =
    fixedFinanceCharge +
    variableFinanceCharge;

  /*
   * ----------------------------------------------------------
   * TOTAL COST
   * ----------------------------------------------------------
   */

  const totalCost =
    baseAmount +
    insurance +
    variableFinanceCharge;

  const costPerUnit =
    totalCost /
    quantity;

  const salesUnitPrice =
    salesPrice /
    quantity;

  const profitAmount =
    salesPrice -
    totalCost;

  const finalMarginPct =
    salesPrice === 0
      ? 0
      : (profitAmount /
          salesPrice) *
        100;

  /*
   * ----------------------------------------------------------
   * SAFETY
   * ----------------------------------------------------------
   */

  const values = {
    supplierInvoiceValue,
    exWorksCost,
    inwardClearance,
    inwardBankCharge,
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

  for (
    const [name, value] of Object.entries(
      values,
    )
  ) {
    assertFinite(
      value,
      name,
    );
  }

  /*
   * ----------------------------------------------------------
   * RESULT
   * ----------------------------------------------------------
   */

  return {
    quantityKg:
      round(quantity),

    exWorksCost:
      round(exWorksCost),

    supplierInvoiceValue:
      round(
        supplierInvoiceValue,
      ),

    inwardClearance:
      round(
        inwardClearance,
      ),

    inwardBankCharge:
      round(
        inwardBankCharge,
      ),

    storageCharge:
      round(
        storageCharge,
      ),

    outwardClearance:
      round(
        outwardClearance,
      ),

    outwardTransport:
      round(
        outwardTransport,
      ),

    freight:
      round(freight),

    insurance:
      round(insurance),

    otherExpense:
      round(otherExpense),

    bankFinanceCharge:
      round(
        bankFinanceCharge,
      ),

    capitalInterest:
      round(
        capitalInterest,
      ),

    customsDuty:
      round(
        customsDuty,
      ),

    totalCost:
      round(totalCost),

    costPerUnit:
      round(
        costPerUnit,
        4,
      ),

    salesPrice:
      round(
        salesPrice,
      ),

    salesUnitPrice:
      round(
        salesUnitPrice,
        4,
      ),

    profitAmount:
      round(
        profitAmount,
      ),

    finalMarginPct:
      round(
        finalMarginPct,
        4,
      ),
  };
}