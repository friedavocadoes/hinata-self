"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

function orderNumber() {
  return `SO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createOrderFromQuotation(quotationId: string) {
  const { profile } = await requireUser();
  const parsed = z.string().uuid().safeParse(quotationId);
  if (!parsed.success) throw new Error("Invalid quotation.");
  const admin = createAdminClient();
  const { data: quotation, error } = await admin.from("quotations").select("*").eq("id", quotationId).single();
  if (error || !quotation) throw new Error(error?.message ?? "Quotation not found.");
  if (profile?.role !== "finance_admin" && quotation.created_by !== profile?.id) throw new Error("Forbidden");
  const { data: existing } = await admin.from("orders").select("id").eq("quotation_id", quotationId).maybeSingle();
  if (existing) return existing.id;

  const { data: order, error: orderError } = await admin.from("orders").insert({
    order_number: orderNumber(), quotation_id: quotation.id, customer_id: quotation.customer_id,
    customer_name_snapshot: quotation.customer_name_snapshot, delivery_type: quotation.delivery_type,
    destination_id: quotation.destination_id, destination_name_snapshot: quotation.destination_name_snapshot,
    incoterm_code: quotation.incoterm_code, pay_term_code: quotation.pay_term_code,
    credit_period_days: quotation.credit_period_days, total_sales: quotation.total_sales,
    total_cost: quotation.total_cost, total_profit: quotation.total_profit, status: "draft", created_by: profile!.id,
  }).select("id").single();
  if (orderError || !order) throw new Error(orderError?.message ?? "Failed to create order.");

  const { data: items, error: itemsError } = await admin.from("quotation_items").select("product_id, product_name_snapshot, qty_kg, sales_unit_price, sales_price, cost_per_unit, total_cost, profit_amount").eq("quotation_id", quotationId);
  if (itemsError) throw new Error(itemsError.message);
  const { error: insertItemsError } = await admin.from("order_items").insert((items ?? []).map(item => ({
    order_id: order.id, product_id: item.product_id, product_name_snapshot: item.product_name_snapshot,
    qty_kg: item.qty_kg, unit_selling_price: item.sales_unit_price, total_sales: item.sales_price,
    cost_per_unit: item.cost_per_unit, total_cost: item.total_cost, profit_amount: item.profit_amount,
  })));
  if (insertItemsError) { await admin.from("orders").delete().eq("id", order.id); throw new Error(insertItemsError.message); }

  await admin.from("quotations").update({ status: "won" }).eq("id", quotationId);
  revalidatePath("/orders");
  revalidatePath("/quotations");
  revalidatePath("/dashboard");
  return order.id;
}

export async function updateOrderStatus(orderId: string, status: "draft" | "confirmed" | "partially_fulfilled" | "fulfilled" | "cancelled") {
  const { profile } = await requireUser();
  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("created_by, status").eq("id", orderId).single();
  if (!order || (profile?.role !== "finance_admin" && order.created_by !== profile?.id)) throw new Error("Forbidden");

  if (status === "fulfilled" && order.status !== "fulfilled") {
    const { data: items, error } = await admin.from("order_items").select("product_id, qty_kg, cost_per_unit").eq("order_id", orderId);
    if (error) throw new Error(error.message);
    for (const item of items ?? []) {
      if (!item.product_id || Number(item.qty_kg) <= 0) continue;
      const { error: movementError } = await admin.from("inventory_movements").insert({ product_id: item.product_id, movement_type: "sale", quantity_kg: item.qty_kg, unit_cost_aed: item.cost_per_unit, reference_type: "order", reference_id: orderId, created_by: profile!.id });
      if (movementError) throw new Error(movementError.message);
    }
  }

  const { error } = await admin.from("orders").update({ status }).eq("id", orderId);
  if (error) throw new Error(error.message);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}
