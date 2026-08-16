"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export async function removeOrder(orderId: string) {
  const { profile } = await requireUser();
  const parsed = z.string().uuid().safeParse(orderId);
  if (!parsed.success) throw new Error("Invalid order.");

  const admin = createAdminClient();
  const { data: order, error } = await admin.from("orders").select("id, created_by, quotation_id, status").eq("id", orderId).single();
  if (error || !order) throw new Error(error?.message ?? "Order not found.");
  if (profile?.role !== "finance_admin" && order.created_by !== profile?.id) throw new Error("Forbidden");

  const { count, error: movementError } = await admin.from("inventory_movements").select("id", { count: "exact", head: true }).eq("reference_type", "order").eq("reference_id", orderId);
  if (movementError) throw new Error(movementError.message);
  if (Number(count ?? 0) > 0) throw new Error("This order has already affected inventory and cannot be removed.");

  const { error: removeError } = await admin.from("orders").delete().eq("id", orderId);
  if (removeError) throw new Error(removeError.message);

  if (order.quotation_id) {
    await admin.from("quotations").update({ status: "draft" }).eq("id", order.quotation_id).eq("status", "won");
  }

  revalidatePath("/orders");
  revalidatePath("/quotations");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
}
