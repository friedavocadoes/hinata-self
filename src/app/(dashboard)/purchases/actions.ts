"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

function purchaseNumber() {
  return `PO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

const lineSchema = z.object({
  productId: z.string().uuid(),
  qtyKg: z.number().positive(),
  volumeCbm: z.number().nonnegative(),
  unitExWorksCostAed: z.number().nonnegative(),
});

const schema = z.object({
  supplierId: z.string().uuid(),
  incotermCode: z.string().min(1).max(50),
  warehouseId: z.string().uuid(),
  containerReference: z.string().max(150).optional(),
  paymentTerm: z.string().max(100).optional(),
  creditDays: z.coerce.number().int().min(0).default(0),
  storageRateAedPerCbmDay: z.coerce.number().nonnegative(),
  inwardClearanceCharge: z.coerce.number().nonnegative().default(0),
  inwardBankCharge: z.coerce.number().nonnegative().default(0),
  outwardClearanceCharge: z.coerce.number().nonnegative().default(0),
  outwardTransportCharge: z.coerce.number().nonnegative().default(0),
  freight: z.coerce.number().nonnegative().default(0),
  insurance: z.coerce.number().nonnegative().default(0),
  otherExpense: z.coerce.number().nonnegative().default(0),
  financeCharge: z.coerce.number().nonnegative().default(0),
  items: z.string().min(2),
});

function parseLines(raw: string) {
  const parsed = z.array(lineSchema).min(1).safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("At least one valid purchase item is required.");
  const ids = new Set(parsed.data.map((line) => line.productId));
  if (ids.size !== parsed.data.length) throw new Error("A product can only appear once in a container purchase.");
  return parsed.data;
}

function calculateContainerTotals(input: z.infer<typeof schema>, lines: z.infer<typeof lineSchema>[]) {
  const exWorks = lines.reduce((sum, line) => sum + line.qtyKg * line.unitExWorksCostAed, 0);
  const shared = input.inwardClearanceCharge + input.inwardBankCharge + input.outwardClearanceCharge + input.outwardTransportCharge + input.freight + input.insurance + input.otherExpense + input.financeCharge;
  return { exWorks, shared, total: exWorks + shared };
}

export async function createPurchaseOrder(formData: FormData) {
  const { profile } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid container purchase data.");
  const input = parsed.data;
  const lines = parseLines(input.items);
  const admin = createAdminClient();

  const [{ data: supplier }, { data: warehouse }, { data: products }] = await Promise.all([
    admin.from("suppliers").select("id, name").eq("id", input.supplierId).single(),
    admin.from("warehouses").select("id, name, storage_rate_aed_per_cbm_day").eq("id", input.warehouseId).single(),
    admin.from("products").select("id, name").in("id", lines.map((line) => line.productId)),
  ]);

  if (!supplier || !warehouse) throw new Error("Supplier or warehouse not found.");
  if (!products || products.length !== lines.length) throw new Error("One or more selected products could not be found.");

  const totals = calculateContainerTotals(input, lines);
  const { data: purchase, error } = await admin.from("purchase_orders").insert({
    purchase_number: purchaseNumber(),
    supplier_id: supplier.id,
    supplier_name_snapshot: supplier.name,
    incoterm_code: input.incotermCode,
    warehouse_id: warehouse.id,
    container_reference: input.containerReference || null,
    supplier_payment_term: input.paymentTerm || null,
    supplier_credit_days: input.creditDays,
    storage_rate_aed_per_cbm_day: input.storageRateAedPerCbmDay,
    ex_works_cost: totals.exWorks,
    inward_clearance_charge: input.inwardClearanceCharge,
    inward_bank_charge: input.inwardBankCharge,
    outward_clearance_charge: input.outwardClearanceCharge,
    outward_transport_charge: input.outwardTransportCharge,
    freight: input.freight,
    insurance: input.insurance,
    other_expense: input.otherExpense,
    finance_charge: input.financeCharge,
    total_value_aed: totals.exWorks,
    total_cost: totals.total,
    status: "draft",
    created_by: profile!.id,
  }).select("id").single();

  if (error || !purchase) throw new Error(error?.message ?? "Failed to create purchase order.");

  const itemRows = lines.map((line) => {
    const product = products.find((p) => p.id === line.productId)!;
    const total = line.qtyKg * line.unitExWorksCostAed;
    return {
      purchase_order_id: purchase.id,
      product_id: product.id,
      product_name_snapshot: product.name,
      qty_kg: line.qtyKg,
      volume_cbm: line.volumeCbm,
      unit_purchase_price_aed: line.unitExWorksCostAed,
      total_purchase_value_aed: total,
    };
  });

  const { error: itemError } = await admin.from("purchase_items").insert(itemRows);
  if (itemError) {
    await admin.from("purchase_orders").delete().eq("id", purchase.id);
    throw new Error(itemError.message);
  }

  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  return purchase.id;
}

export async function receivePurchase(purchaseId: string) {
  const { profile } = await requireUser();
  const admin = createAdminClient();
  const { data: purchase } = await admin.from("purchase_orders").select("id, created_by, status, warehouse_id, storage_rate_aed_per_cbm_day").eq("id", purchaseId).single();
  if (!purchase || (profile?.role !== "finance_admin" && purchase.created_by !== profile?.id)) throw new Error("Forbidden");
  if (purchase.status === "received") return;

  const { data: items, error } = await admin.from("purchase_items").select("id, product_id, qty_kg, unit_purchase_price_aed, received_qty_kg").eq("purchase_order_id", purchaseId);
  if (error) throw new Error(error.message);

  const receivedAt = new Date().toISOString();

  for (const item of items ?? []) {
    const remaining = Number(item.qty_kg) - Number(item.received_qty_kg);
    if (remaining <= 0 || !item.product_id) continue;

    const { error: movementError } = await admin.from("inventory_movements").insert({
      product_id: item.product_id,
      purchase_item_id: item.id,
      warehouse_id: purchase.warehouse_id,
      movement_type: "purchase",
      quantity_kg: remaining,
      unit_cost_aed: item.unit_purchase_price_aed,
      reference_type: "purchase_order",
      reference_id: purchaseId,
      movement_date: receivedAt,
      created_by: profile!.id,
    });
    if (movementError) throw new Error(movementError.message);

    const { error: itemUpdateError } = await admin.from("purchase_items").update({ received_qty_kg: Number(item.qty_kg), received_at: receivedAt }).eq("id", item.id);
    if (itemUpdateError) throw new Error(itemUpdateError.message);
  }

  const { error: purchaseError } = await admin.from("purchase_orders").update({ status: "received", received_at: receivedAt }).eq("id", purchaseId);
  if (purchaseError) throw new Error(purchaseError.message);

  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/quotations");
  revalidatePath("/dashboard");
}
