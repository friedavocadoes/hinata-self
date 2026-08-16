"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getProductStockLevels() {
  await requireUser();
  const admin = createAdminClient();
  const { data, error } = await admin.from("inventory_balances").select("product_id, quantity_kg");
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((row) => [row.product_id, Number(row.quantity_kg)]));
}

export async function removeQuotation(quotationId: string) {
  const { profile } = await requireUser();
  const parsed = z.string().uuid().safeParse(quotationId);
  if (!parsed.success) throw new Error("Invalid costing.");

  const admin = createAdminClient();
  const { data: quotation, error } = await admin.from("quotations").select("id, created_by, status").eq("id", quotationId).single();
  if (error || !quotation) throw new Error(error?.message ?? "Costing not found.");
  if (profile?.role !== "finance_admin" && quotation.created_by !== profile?.id) throw new Error("Forbidden");

  const { data: order, error: orderError } = await admin.from("orders").select("id").eq("quotation_id", quotationId).maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (order) throw new Error("This costing has an order linked to it and cannot be removed.");

  const { error: removeError } = await admin.from("quotations").delete().eq("id", quotationId);
  if (removeError) throw new Error(removeError.message);

  revalidatePath("/quotations");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}
