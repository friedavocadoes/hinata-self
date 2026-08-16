"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { revertOrderInventory } from "@/lib/inventory/revert-history";

export async function removeOrder(orderId: string) {
  const { profile } = await requireUser();
  const parsed = z.string().uuid().safeParse(orderId);
  if (!parsed.success) throw new Error("Invalid order.");

  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from("orders")
    .select("id, created_by, quotation_id")
    .eq("id", orderId)
    .single();

  if (error || !order) throw new Error(error?.message ?? "Order not found.");
  if (profile?.role !== "finance_admin" && order.created_by !== profile?.id) throw new Error("Forbidden");

  // Removing an order is destructive: undo its sale movements first so the
  // stock consumed by fulfillment becomes available again.
  await revertOrderInventory(admin, orderId);

  const { error: removeError } = await admin
    .from("orders")
    .delete()
    .eq("id", orderId);

  if (removeError) throw new Error(removeError.message);

  if (order.quotation_id) {
    const { error: quotationError } = await admin
      .from("quotations")
      .update({ status: "draft" })
      .eq("id", order.quotation_id)
      .eq("status", "won");

    if (quotationError) throw new Error(quotationError.message);
  }

  revalidatePath("/orders");
  revalidatePath("/quotations");
  revalidatePath("/inventory");
  revalidatePath("/purchases");
  revalidatePath("/dashboard");
}
