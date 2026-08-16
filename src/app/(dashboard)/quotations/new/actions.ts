"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateCosting } from "@/lib/costing/engine";
import { CostingInput, CostingSettings, IncotermCostRule, PurchaseBatch } from "@/lib/costing/types";

const calculateSchema = z.object({
  customerId: z.string().uuid(),
  deliveryType: z.enum(["local", "export"]),
  destinationId: z.string().uuid(),
  incoterm: z.string().uuid(),
  paymentTerm: z.string().uuid(),
  creditDays: z.number().finite().min(0),
  vehicleType: z.string().uuid(),
  freightAed: z.number().finite().min(0).default(0),
  items: z.array(z.object({ productId: z.string().uuid(), quantityKg: z.number().finite().positive(), targetProfitPct: z.number().finite().min(0).lt(100) })).min(1),
});

type CalculationInput = z.infer<typeof calculateSchema>;

type InternalCalculation = {
  items: Array<{
    productId: string;
    productName: string;
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
  }>;
  totalSales: number;
  totalCost: number;
  totalProfit: number;
  finalMarginPct: number;
  customerName: string;
  destinationName: string;
  incotermCode: string;
  paymentTermCode: string;
  vehicleTypeId: string;
};

function settingsFromRows(rows: { setting_key: string; setting_value: number | string }[]): CostingSettings {
  const raw = Object.fromEntries(rows.map((row) => [row.setting_key, Number(row.setting_value)]));
  const required = ["annual_interest_rate", "customer_da_flat_fee", "customer_lc_flat_fee", "customer_lc_value_pct", "customer_bank_draft_flat_fee", "dwc_surcharge_under_7t", "dwc_surcharge_over_7t"] as const;
  for (const key of required) if (!Number.isFinite(raw[key])) throw new Error(`Missing or invalid costing setting: ${key}.`);
  return raw as unknown as CostingSettings;
}

function assertFiniteNumber(value: number, field: string) {
  if (!Number.isFinite(value)) throw new Error(`Costing calculation produced an invalid value for "${field}".`);
}

async function calculateInternal(input: CalculationInput): Promise<InternalCalculation> {
  const admin = createAdminClient();
  const [settingsResult, customerResult, destinationResult, incotermResult, paymentTermResult, vehicleResult, productsResult] = await Promise.all([
    admin.from("global_settings").select("setting_key, setting_value"),
    admin.from("customers").select("id, name").eq("id", input.customerId).single(),
    admin.from("destinations").select("id, name, code, delivery_type, region").eq("id", input.destinationId).single(),
    admin.from("incoterms").select("id, name, code, delivery_type").eq("id", input.incoterm).single(),
    admin.from("payment_terms").select("id, name, code").eq("id", input.paymentTerm).single(),
    admin.from("vehicle_types").select("id, code, name, capacity_kg").eq("id", input.vehicleType).eq("active", true).single(),
    admin.from("products").select("id, name").in("id", [...new Set(input.items.map((item) => item.productId))]).eq("active", true),
  ]);

  for (const result of [settingsResult, customerResult, destinationResult, incotermResult, paymentTermResult, vehicleResult, productsResult]) if (result.error) throw new Error(result.error.message);

  const settings = settingsFromRows(settingsResult.data ?? []);
  const customer = customerResult.data!;
  const destination = destinationResult.data!;
  const incoterm = incotermResult.data!;
  const paymentTerm = paymentTermResult.data!;
  const vehicle = vehicleResult.data!;
  const products = productsResult.data ?? [];

  if (products.length !== new Set(input.items.map((item) => item.productId)).size) throw new Error("One or more selected products could not be found or are inactive.");

  const { data: rules, error: rulesError } = await admin.from("incoterm_cost_rules").select("cost_code, enabled, calculation_type, amount_aed, rate_pct, base_code, multiplier").eq("incoterm_code", incoterm.code).in("scope", ["selling", "both"]).eq("active", true);
  if (rulesError) throw new Error(rulesError.message);

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const { data: purchaseItems, error: purchaseItemsError } = await admin
    .from("purchase_items")
    .select("id, purchase_order_id, product_id, product_name_snapshot, qty_kg, received_qty_kg, sold_qty_kg, volume_cbm, unit_purchase_price_aed, received_at")
    .in("product_id", productIds)
    .gt("received_qty_kg", 0)
    .order("received_at", { ascending: true });
  if (purchaseItemsError) throw new Error(purchaseItemsError.message);

  const purchaseOrderIds = [...new Set((purchaseItems ?? []).map((item) => item.purchase_order_id))];
  if (purchaseOrderIds.length === 0) throw new Error("No received purchase stock exists for the selected products.");

  const { data: purchaseOrders, error: purchaseOrdersError } = await admin
    .from("purchase_orders")
    .select("id, purchase_number, status, ex_works_cost, inward_clearance_charge, inward_bank_charge, outward_clearance_charge, outward_transport_charge, freight, insurance, other_expense, finance_charge, storage_rate_aed_per_cbm_day, warehouse_id")
    .in("id", purchaseOrderIds)
    .eq("status", "received");
  if (purchaseOrdersError) throw new Error(purchaseOrdersError.message);

  const warehouseIds = [...new Set((purchaseOrders ?? []).map((po) => po.warehouse_id).filter(Boolean))];
  const { data: warehouses } = warehouseIds.length
    ? await admin.from("warehouses").select("id, storage_rate_aed_per_cbm_day").in("id", warehouseIds)
    : { data: [] as { id: string; storage_rate_aed_per_cbm_day: number }[] };

  const purchaseOrderMap = new Map((purchaseOrders ?? []).map((po) => [po.id, po]));
  const warehouseMap = new Map((warehouses ?? []).map((warehouse) => [warehouse.id, warehouse]));
  const batchesByProduct = new Map<string, PurchaseBatch[]>();

  for (const item of purchaseItems ?? []) {
    const po = purchaseOrderMap.get(item.purchase_order_id);
    if (!po || !item.received_at) continue;
    const available = Number(item.received_qty_kg) - Number(item.sold_qty_kg ?? 0);
    if (available <= 0) continue;
    const warehouseRate = po.warehouse_id ? Number(warehouseMap.get(po.warehouse_id)?.storage_rate_aed_per_cbm_day ?? 0) : 0;
    const storageRate = Number(po.storage_rate_aed_per_cbm_day ?? warehouseRate);
    const sharedCost = Number(po.inward_clearance_charge ?? 0) + Number(po.inward_bank_charge ?? 0) + Number(po.outward_clearance_charge ?? 0) + Number(po.outward_transport_charge ?? 0) + Number(po.freight ?? 0) + Number(po.insurance ?? 0) + Number(po.other_expense ?? 0) + Number(po.finance_charge ?? 0);
    const batch: PurchaseBatch = {
      purchaseItemId: item.id,
      purchaseNumber: po.purchase_number,
      purchaseOrderId: po.id,
      quantityAvailableKg: available,
      quantityOriginalKg: Number(item.qty_kg),
      volumeCbm: Number(item.volume_cbm ?? 0),
      receivedAt: item.received_at,
      unitExWorksCostAed: Number(item.unit_purchase_price_aed),
      purchaseOrderExWorksCost: Number(po.ex_works_cost ?? 0),
      purchaseSharedCost: sharedCost,
      storageRateAedPerCbmDay: storageRate,
      inwardClearanceCharge: Number(po.inward_clearance_charge ?? 0),
      inwardBankCharge: Number(po.inward_bank_charge ?? 0),
      outwardClearanceCharge: Number(po.outward_clearance_charge ?? 0),
      outwardTransportCharge: Number(po.outward_transport_charge ?? 0),
      freightCharge: Number(po.freight ?? 0),
      insuranceCharge: Number(po.insurance ?? 0),
      otherExpenseCharge: Number(po.other_expense ?? 0),
      financeCharge: Number(po.finance_charge ?? 0),
    };
    const existing = batchesByProduct.get(item.product_id) ?? [];
    existing.push(batch);
    batchesByProduct.set(item.product_id, existing);
  }

  const transportRule = (rules ?? []).find((rule) => rule.cost_code === "outward_transport" && rule.enabled && rule.calculation_type !== "disabled");
  const transportResult = transportRule
    ? await admin.from("transport_rates").select("rate_aed").eq("destination_id", input.destinationId).eq("vehicle_type_id", input.vehicleType).eq("active", true).maybeSingle()
    : { data: null, error: null };
  if (transportResult.error) throw new Error(transportResult.error.message);
  if (transportRule && input.deliveryType === "local" && !transportResult.data) throw new Error(`No transport rate is configured for ${destination.name} using ${vehicle.name}.`);

  const results: InternalCalculation["items"] = [];

  for (const item of input.items) {
    const product = products.find((row) => row.id === item.productId)!;
    const batches = batchesByProduct.get(item.productId) ?? [];
    if (!batches.length) throw new Error(`${product.name} has no received stock available for costing.`);

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
      freightAed: input.freightAed,
    };

    const result = calculateCosting(costingInput, {
      batches,
      rules: (rules ?? []) as IncotermCostRule[],
      settings,
      transport: transportResult.data,
      vehicle: { code: vehicle.code, capacity_kg: vehicle.capacity_kg === null ? null : Number(vehicle.capacity_kg) },
      destination: { code: destination.code, region: destination.region },
    });

    results.push({ productId: item.productId, productName: product.name, ...result });
  }

  const totalSales = results.reduce((sum, item) => sum + Number(item.salesPrice), 0);
  const totalCost = results.reduce((sum, item) => sum + Number(item.totalCost), 0);
  const totalProfit = results.reduce((sum, item) => sum + Number(item.profitAmount), 0);
  const finalMarginPct = totalSales === 0 ? 0 : (totalProfit / totalSales) * 100;
  assertFiniteNumber(totalSales, "Total sales");
  assertFiniteNumber(totalCost, "Total cost");
  assertFiniteNumber(totalProfit, "Total profit");
  assertFiniteNumber(finalMarginPct, "Final margin");

  return { items: results, totalSales, totalCost, totalProfit, finalMarginPct, customerName: customer.name, destinationName: destination.name, incotermCode: incoterm.code, paymentTermCode: paymentTerm.code, vehicleTypeId: vehicle.id };
}

function generateQuoteNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `QT-${date}-${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

async function persistQuotation(profileId: string, input: CalculationInput, calculation: InternalCalculation) {
  const admin = createAdminClient();
  const { data: quotation, error: quotationError } = await admin.from("quotations").insert({
    quote_number: generateQuoteNumber(), created_by: profileId, customer_id: input.customerId, customer_name_snapshot: calculation.customerName,
    delivery_type: input.deliveryType, destination_id: input.destinationId, destination_name_snapshot: calculation.destinationName,
    incoterm_code: calculation.incotermCode, pay_term_code: calculation.paymentTermCode, credit_period_days: input.creditDays,
    vehicle_type_id: calculation.vehicleTypeId, total_cost: calculation.totalCost, total_sales: calculation.totalSales,
    total_profit: calculation.totalProfit, final_margin_pct: calculation.finalMarginPct, status: "draft",
  }).select("id, quote_number").single();
  if (quotationError || !quotation) throw new Error(quotationError?.message ?? "Failed to save costing.");

  const itemRows = calculation.items.map((item) => ({
    quotation_id: quotation.id, product_id: item.productId, product_name_snapshot: item.productName, qty_kg: item.quantityKg,
    target_profit_pct: input.items.find((source) => source.productId === item.productId)?.targetProfitPct ?? 0,
    supplier_invoice_value: item.supplierInvoiceValue, ex_works_cost: item.exWorksCost, inward_clearance: item.inwardClearance,
    inward_bank_charge: item.inwardBankCharge, storage_charge: item.storageCharge, outward_clearance: item.outwardClearance,
    outward_transport: item.outwardTransport, freight: item.freight, insurance: item.insurance, other_expense: item.otherExpense,
    bank_finance_charge: item.bankFinanceCharge, capital_interest: item.capitalInterest, customs_duty: item.customsDuty,
    total_cost: item.totalCost, cost_per_unit: item.costPerUnit, sales_unit_price: item.salesUnitPrice, sales_price: item.salesPrice,
    profit_amount: item.profitAmount, final_margin_pct: item.finalMarginPct, warehouse_days: Math.round(item.warehouseDays), purchase_unit_cost_aed: item.purchaseUnitCost,
  }));

  const { error: itemsError } = await admin.from("quotation_items").insert(itemRows);
  if (itemsError) { await admin.from("quotations").delete().eq("id", quotation.id); throw new Error(itemsError.message); }
  return quotation;
}

export async function calculateQuotation(rawInput: CalculationInput) {
  const { profile } = await requireUser();
  const parsed = calculateSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false as const, error: "Invalid costing data." };

  const input = parsed.data;
  const calculation = await calculateInternal(input);
  const quotation = await persistQuotation(profile!.id, input, calculation);
  revalidatePath("/quotations");
  revalidatePath("/dashboard");

  if (profile?.role === "finance_admin") return { success: true as const, role: "finance_admin" as const, quotationId: quotation.id, quoteNumber: quotation.quote_number, items: calculation.items, totalSales: calculation.totalSales, totalCost: calculation.totalCost, totalProfit: calculation.totalProfit };
  return { success: true as const, role: "sales_rep" as const, quotationId: quotation.id, quoteNumber: quotation.quote_number, items: calculation.items.map((item) => ({ productId: item.productId, productName: item.productName, quantityKg: item.quantityKg, salesUnitPrice: item.salesUnitPrice, salesPrice: item.salesPrice })), totalSales: calculation.totalSales };
}

export async function getCustomerProducts(customerId: string) {
  await requireUser();
  const parsed = z.string().uuid().safeParse(customerId);
  if (!parsed.success) throw new Error("Invalid customer.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("customer_products").select("id, product_id, product_name_original, payment_term, incoterm, place_of_delivery, product_match_status").eq("customer_id", customerId).order("product_name_original");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getVehicleTypes() {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicle_types").select("id, code, name, capacity_kg").eq("active", true).order("capacity_kg", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data?.map((vehicle) => ({ id: vehicle.id, name: vehicle.name })) ?? [];
}
