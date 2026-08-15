"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { calculateCosting } from "@/lib/costing/engine";
import { CostingInput, CostingSettings } from "@/lib/costing/types";

/*
 * ============================================================
 * QUOTATION CALCULATION SCHEMA
 * ============================================================
 */

const calculateSchema = z.object({
  customerId: z.string().uuid(),

  deliveryType: z.enum(["local", "export"]),

  destinationId: z.string().uuid(),

  incoterm: z.string().min(1),

  paymentTerm: z.string().min(1),

  creditDays: z.number().min(0),

  /*
   * Vehicle capacity is required because transport rates
   * depend on both destination AND vehicle size.
   */
  vehicleType: z.string().min(1),

  items: z
    .array(
      z.object({
        productId: z.string().uuid(),

        quantityKg: z.number().positive(),

        targetProfitPct: z.number().min(0).lt(100),
      }),
    )
    .min(1),
});

type CalculationInput = z.infer<typeof calculateSchema>;

/*
 * ============================================================
 * GLOBAL SETTINGS
 * ============================================================
 */

function settingsFromRows(
  rows: {
    setting_key: string;
    setting_value: number;
  }[],
): CostingSettings {
  const settings = Object.fromEntries(
    rows.map((row) => [row.setting_key, Number(row.setting_value)]),
  );

  return {
    usd_to_aed_conversion: settings.usd_to_aed_conversion,

    annual_interest_rate: settings.annual_interest_rate,

    customs_duty_pct: settings.customs_duty_pct,

    tt_bank_flat_fee: settings.tt_bank_flat_fee,

    da_bank_fee_pct: settings.da_bank_fee_pct,

    lc_sight_pct: settings.lc_sight_pct,

    lc_30_pct: settings.lc_30_pct,

    lc_60_pct: settings.lc_60_pct,

    lc_90_pct: settings.lc_90_pct,

    lc_120_pct: settings.lc_120_pct,

    customer_da_flat_fee: settings.customer_da_flat_fee,

    customer_lc_flat_fee: settings.customer_lc_flat_fee,

    customer_lc_value_pct: settings.customer_lc_value_pct,

    customer_bank_draft_flat_fee: settings.customer_bank_draft_flat_fee,

    marine_insurance_base_pct: settings.marine_insurance_base_pct ?? 0.0007,

    marine_insurance_cif_multiplier:
      settings.marine_insurance_cif_multiplier ?? 1.1,

    marine_insurance_fob_multiplier:
      settings.marine_insurance_fob_multiplier ?? 1.2,

    courier_local_aed: settings.courier_local_aed,

    courier_gcc_aed: settings.courier_gcc_aed,

    courier_africa_aed: settings.courier_africa_aed,

    dwc_surcharge_under_7t: settings.dwc_surcharge_under_7t,

    dwc_surcharge_over_7t: settings.dwc_surcharge_over_7t,
  };
}

/*
 * ============================================================
 * CALCULATE QUOTATION
 * ============================================================
 */

export async function calculateQuotation(rawInput: CalculationInput) {
  const { profile } = await requireUser();

  /*
   * Validate everything before touching the database.
   */
  const parsed = calculateSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      success: false as const,
      error: "Invalid quotation data.",
    };
  }

  const input = parsed.data;

  const supabase = await createClient();

  /*
   * ==========================================================
   * LOAD GLOBAL DATA
   * ==========================================================
   *
   * These values come from the database.
   * Nothing financial is hardcoded here.
   */

  const [
    settingsResult,
    destinationResult,
    incotermResult,
    paymentTermResult,
    transportResult,
  ] = await Promise.all([
    supabase.from("global_settings").select("setting_key, setting_value"),

    supabase
      .from("destinations")
      .select("id, name, code")
      .eq("id", input.destinationId)
      .single(),

    supabase
      .from("incoterms")
      .select("id, name, code")
      .eq("id", input.incoterm)
      .single(),

    supabase
      .from("payment_terms")
      .select("id, name, code")
      .eq("id", input.paymentTerm)
      .single(),

    /*
     * Transport is determined by:
     *
     * Destination
     * +
     * Vehicle capacity
     */
    supabase
      .from("transport_rates")
      .select("id, rate_aed, destination_id, truck_size")
      .eq("destination_id", input.destinationId)
      .eq("truck_size", input.vehicleType)
      .eq("active", true)
      .maybeSingle(),
  ]);

  /*
   * ==========================================================
   * ERROR HANDLING
   * ==========================================================
   */

  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  if (destinationResult.error) {
    throw new Error(destinationResult.error.message);
  }

  if (incotermResult.error) {
    throw new Error(incotermResult.error.message);
  }

  if (paymentTermResult.error) {
    throw new Error(paymentTermResult.error.message);
  }

  if (transportResult.error) {
    throw new Error(transportResult.error.message);
  }

  /*
   * A transport rate should exist for a valid
   * destination + vehicle combination.
   */
  if (!transportResult.data) {
    throw new Error(
      `No transport rate found for the selected destination and vehicle type.`,
    );
  }

  /*
   * ==========================================================
   * PREPARE CALCULATION SETTINGS
   * ==========================================================
   */

  const settings = settingsFromRows(settingsResult.data);

  /*
   * The calculation engine works with database codes,
   * not UUIDs.
   */
  const incoterm = incotermResult.data.code;

  const paymentTerm = paymentTermResult.data.code;

  const transport = transportResult.data;

  /*
   * ==========================================================
   * LOAD PRODUCTS
   * ==========================================================
   */

  const productIds = input.items.map((item) => item.productId);

  const productsResult = await supabase
    .from("products")
    .select(
      `
          id,
          cif_rate_usd,
          inward_clearance_charge,
          storage_rate,
          storage_days,
          default_profit_pct
        `,
    )
    .in("id", productIds);

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  const products = productsResult.data;

  /*
   * ==========================================================
   * CALCULATE EACH LINE ITEM
   * ==========================================================
   */

  const results = [];

  for (const item of input.items) {
    const product = products.find((product) => product.id === item.productId);

    if (!product) {
      throw new Error("One of the selected products could not be found.");
    }

    const costingInput: CostingInput = {
      productId: item.productId,

      quantityKg: item.quantityKg,

      deliveryType: input.deliveryType,

      destinationId: input.destinationId,

      incoterm,

      paymentTerm,

      creditDays: input.creditDays,

      targetProfitPct: item.targetProfitPct,

      /*
       * Vehicle capacity is now passed
       * to the costing engine.
       */
      vehicleType: input.vehicleType,
    };

    const result = calculateCosting(costingInput, {
      product,
      settings,
      transport,
    });

    results.push({
      productId: item.productId,

      ...result,
    });
  }

  /*
   * ==========================================================
   * TOTALS
   * ==========================================================
   */

  const totalSales = results.reduce((sum, item) => sum + item.salesPrice, 0);

  const totalCost = results.reduce((sum, item) => sum + item.totalCost, 0);

  const totalProfit = results.reduce((sum, item) => sum + item.profitAmount, 0);

  /*
   * ==========================================================
   * ROLE-BASED RESPONSE
   * ==========================================================
   *
   * Sales representatives MUST NOT receive internal
   * costing information.
   */

  if (profile?.role === "finance_admin") {
    return {
      success: true as const,

      role: "finance_admin" as const,

      items: results,

      totalSales,

      totalCost,

      totalProfit,
    };
  }

  /*
   * Sales representative response.
   *
   * Only customer-facing pricing is returned.
   */
  return {
    success: true as const,

    role: "sales_rep" as const,

    items: results.map((item) => ({
      productId: item.productId,

      quantityKg: item.quantityKg,

      salesUnitPrice: item.salesUnitPrice,

      salesPrice: item.salesPrice,
    })),

    totalSales,
  };
}

/*
 * ============================================================
 * CUSTOMER → PRODUCT LOOKUP
 * ============================================================
 */

const customerProductsSchema = z.object({
  customerId: z.string().uuid(),
});

export async function getCustomerProducts(customerId: string) {
  await requireUser();

  const parsed = customerProductsSchema.safeParse({
    customerId,
  });

  if (!parsed.success) {
    throw new Error("Invalid customer.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_products")
    .select(
      `
        id,
        product_id,
        product_name_original,
        payment_term,
        incoterm,
        place_of_delivery,
        product_match_status
      `,
    )
    .eq("customer_id", customerId)
    .order("product_name_original");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
