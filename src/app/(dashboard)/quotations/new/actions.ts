"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateCosting } from "@/lib/costing/engine";
import { CostingInput, CostingSettings } from "@/lib/costing/types";

const calculateSchema = z.object({
  customerId: z.string().uuid(),
  deliveryType: z.enum(["local", "export"]),
  destinationId: z.string().uuid(),
  incoterm: z.string().uuid(),
  paymentTerm: z.string().uuid(),
  creditDays: z.number().finite().min(0),
  vehicleType: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantityKg: z.number().finite().positive(),
    targetProfitPct: z.number().finite().min(0).lt(100),
  })).min(1),
});

type CalculationInput = z.infer<typeof calculateSchema>;

function settingsFromRows(rows: { setting_key: string; setting_value: number | string }[]): CostingSettings {
  const raw = Object.fromEntries(
    rows.map((row) => [row.setting_key, Number(row.setting_value)]),
  );

  const required = [
    "usd_to_aed_conversion",
    "annual_interest_rate",
    "customs_duty_pct",
    "tt_bank_flat_fee",
    "da_bank_fee_pct",
    "lc_sight_pct",
    "lc_30_pct",
    "lc_60_pct",
    "lc_90_pct",
    "lc_120_pct",
    "customer_da_flat_fee",
    "customer_lc_flat_fee",
    "customer_lc_value_pct",
    "customer_bank_draft_flat_fee",
    "marine_insurance_base_pct",
    "marine_insurance_cif_multiplier",
    "marine_insurance_fob_multiplier",
    "courier_local_aed",
    "courier_gcc_aed",
    "courier_africa_aed",
    "dwc_surcharge_under_7t",
    "dwc_surcharge_over_7t",
  ] as const;

  for (const key of required) {
    if (!Number.isFinite(raw[key])) {
      throw new Error(`Missing or invalid costing setting: ${key}.`);
    }
  }

  return raw as unknown as CostingSettings;
}

function assertFiniteNumber(value: number, field: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`Costing calculation produced an invalid value for "${field}".`);
  }
}

export async function calculateQuotation(rawInput: CalculationInput) {
  const { profile } = await requireUser();
  const parsed = calculateSchema.safeParse(rawInput);

  if (!parsed.success) {
    return { success: false as const, error: "Invalid quotation data." };
  }

  const input = parsed.data;

  // All financial master data is read with a server-only privileged client.
  // The authenticated browser/user never receives these raw values.
  const admin = createAdminClient();

  const [settingsResult, destinationResult, incotermResult, paymentTermResult, vehicleResult] =
    await Promise.all([
      admin.from("global_settings").select("setting_key, setting_value"),
      admin.from("destinations").select("id, name, code, delivery_type, region").eq("id", input.destinationId).single(),
      admin.from("incoterms").select("id, name, code, delivery_type").eq("id", input.incoterm).single(),
      admin.from("payment_terms").select("id, name, code").eq("id", input.paymentTerm).single(),
      admin.from("vehicle_types").select("id, code, name, capacity_kg").eq("id", input.vehicleType).eq("active", true).single(),
    ]);

  for (const result of [settingsResult, destinationResult, incotermResult, paymentTermResult, vehicleResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const settings = settingsFromRows(settingsResult.data ?? []);
  const destination = destinationResult.data!;
  const incoterm = incotermResult.data!;
  const paymentTerm = paymentTermResult.data!;
  const vehicle = vehicleResult.data!;

  const transportResult = await admin
    .from("transport_rates")
    .select("id, destination_id, vehicle_type_id, rate_aed")
    .eq("destination_id", input.destinationId)
    .eq("vehicle_type_id", input.vehicleType)
    .eq("active", true)
    .maybeSingle();

  if (transportResult.error) throw new Error(transportResult.error.message);

  const transport = transportResult.data;

  if (input.deliveryType === "local" && !transport) {
    throw new Error(`No transport rate is configured for ${destination.name} using ${vehicle.name}.`);
  }

  const productIds = [...new Set(input.items.map((item) => item.productId))];

  const productsResult = await admin
    .from("products")
    .select(`
      id,
      name,
      pack_size_kg,
      cif_rate_usd,
      inward_clearance_charge,
      storage_rate,
      storage_days,
      default_profit_pct,
      supplier_id,
      supplier_mop,
      supplier_credit_days
    `)
    .in("id", productIds)
    .eq("active", true);

  if (productsResult.error) throw new Error(productsResult.error.message);

  const products = productsResult.data ?? [];

  if (products.length !== productIds.length) {
    throw new Error("One or more selected products could not be found or are inactive.");
  }

  const results = [];

  for (const item of input.items) {
    const product = products.find((row) => row.id === item.productId);
    if (!product) throw new Error("Selected product could not be found.");

    const normalizedProduct = {
      ...product,
      pack_size_kg: Number(product.pack_size_kg),
      cif_rate_usd: Number(product.cif_rate_usd),
      inward_clearance_charge: Number(product.inward_clearance_charge ?? 0),
      storage_rate: Number(product.storage_rate ?? 0),
      storage_days: Number(product.storage_days ?? 0),
      default_profit_pct: Number(product.default_profit_pct ?? 0),
      supplier_credit_days: Number(product.supplier_credit_days ?? 0),
    };

    assertFiniteNumber(normalizedProduct.cif_rate_usd, "CIF rate");
    assertFiniteNumber(normalizedProduct.inward_clearance_charge, "Inward clearance");
    assertFiniteNumber(normalizedProduct.storage_rate, "Storage rate");
    assertFiniteNumber(normalizedProduct.storage_days, "Storage days");

    const costingInput: CostingInput = {
      productId: item.productId,
      quantityKg: item.quantityKg,
      deliveryType: input.deliveryType,
      destinationId: input.destinationId,
      incoterm: incoterm.code,
      paymentTerm: paymentTerm.code,
      creditDays: input.creditDays,
      targetProfitPct: item.targetProfitPct,
      vehicleType: input.vehicleType,
    };

    const result = calculateCosting(costingInput, {
      product: normalizedProduct,
      settings,
      transport,
      vehicle: {
        code: vehicle.code,
        capacity_kg: vehicle.capacity_kg === null ? null : Number(vehicle.capacity_kg),
      },
      destination: { code: destination.code, region: destination.region },
    });

    results.push({ productId: item.productId, productName: product.name, ...result });
  }

  const totalSales = results.reduce((sum, item) => sum + Number(item.salesPrice), 0);
  const totalCost = results.reduce((sum, item) => sum + Number(item.totalCost), 0);
  const totalProfit = results.reduce((sum, item) => sum + Number(item.profitAmount), 0);

  assertFiniteNumber(totalSales, "Total sales");
  assertFiniteNumber(totalCost, "Total cost");
  assertFiniteNumber(totalProfit, "Total profit");

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

  return {
    success: true as const,
    role: "sales_rep" as const,
    items: results.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantityKg: item.quantityKg,
      salesUnitPrice: item.salesUnitPrice,
      salesPrice: item.salesPrice,
    })),
    totalSales,
  };
}

export async function getCustomerProducts(customerId: string) {
  await requireUser();

  const parsed = z.string().uuid().safeParse(customerId);
  if (!parsed.success) throw new Error("Invalid customer.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_products")
    .select(`
      id,
      product_id,
      product_name_original,
      payment_term,
      incoterm,
      place_of_delivery,
      product_match_status
    `)
    .eq("customer_id", customerId)
    .order("product_name_original");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getVehicleTypes() {
  await requireUser();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_types")
    .select("id, code, name, capacity_kg")
    .eq("active", true)
    .order("capacity_kg", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return data?.map((vehicle) => ({ id: vehicle.id, name: vehicle.name })) ?? [];
}
