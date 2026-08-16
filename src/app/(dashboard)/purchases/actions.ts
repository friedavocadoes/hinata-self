"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

function purchaseNumber() {
  return `PO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

const schema = z.object({
  supplierId: z.string().uuid(),
  productId: z.string().uuid(),
  qtyKg: z.coerce.number().positive(),
  unitPriceAed: z.coerce.number().nonnegative(),
  paymentTerm: z.string().max(100).optional(),
  creditDays: z.coerce.number().int().min(0).default(0),
});

export async function createPurchaseOrder(formData: FormData) {
  const { profile } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid purchase order data.");
  const input = parsed.data;
  const admin = createAdminClient();

  const [{ data: supplier }, { data: product }] = await Promise.all([
    admin.from("suppliers").select("id, name").eq("id", input.supplierId).single(),
    admin.from("products").select("id, name").eq("id", input.productId).single(),
  ]);
  if (!supplier || !product) throw new Error("Supplier or product not found.");

  const total = input.qtyKg * input.unitPriceAed;
  const { data: purchase, error } = await admin.from("purchase_orders").insert({
    purchase_number: purchaseNumber(), supplier_id: supplier.id, supplier_name_snapshot: supplier.name,
    supplier_payment_term: input.paymentTerm || null, supplier_credit_days: input.creditDays,
    total_value_aed: total, status: "draft", created_by: profile!.id,
  }).select("id").single();
  if (error || !purchase) throw new Error(error?.message ?? "Failed to create purchase order.");

  const { error: itemError } = await admin.from("purchase_items").insert({
    purchase_order_id: purchase.id, product_id: product.id, product_name_snapshot: product.name,
    qty_kg: input.qtyKg, unit_purchase_price_aed: input.unitPriceAed, total_purchase_value_aed: total,
  });
  if (itemError) { await admin.from("purchase_orders").delete().eq("id", purchase.id); throw new Error(itemError.message); }
  return purchase.id;
}

export async function receivePurchase(purchaseId: string) {
  const { profile } = await requireUser();
  const admin = createAdminClient();
  const { data: purchase } = await admin.from("purchase_orders").select("id, created_by, status").eq("id", purchaseId).single();
  if (!purchase || (profile?.role !== "finance_admin" && purchase.created_by !== profile?.id)) throw new Error("Forbidden");

  const { data: items, error } = await admin.from("purchase_items").select("product_id, qty_kg, unit_purchase_price_aed, received_qty_kg").eq("purchase_order_id", purchaseId);
  if (error) throw new Error(error.message);

  for (const item of items ?? []) {
    const remaining = Number(item.qty_kg) - Number(item.received_qty_kg);
    if (remaining <= 0 || !item.product_id) continue;
    const { error: movementError } = await admin.from("inventory_movements").insert({
      product_id: item.product_id, movement_type: "purchase", quantity_kg: remaining,
      unit_cost_aed: item.unit_purchase_price_aed, reference_type: "purchase_order", reference_id: purchaseId, created_by: profile!.id,
    });
    if (movementError) throw new Error(movementError.message);
    await admin.from("purchase_items").update({ received_qty_kg: item.qty_kg }).eq("purchase_order_id", purchaseId).eq("product_id", item.product_id);
  }

  await admin.from("purchase_orders").update({ status: "received" }).eq("id", purchaseId);
}
