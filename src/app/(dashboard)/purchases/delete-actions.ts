"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export async function deletePurchaseOrder(purchaseId: string) {
  const { profile } = await requireUser();
  const parsed = z.string().uuid().safeParse(purchaseId);
  if (!parsed.success) throw new Error("Invalid purchase order.");

  const admin = createAdminClient();
  const { data: purchase, error } = await admin
    .from("purchase_orders")
    .select("id, created_by, status")
    .eq("id", purchaseId)
    .single();

  if (error || !purchase) throw new Error(error?.message ?? "Purchase order not found.");
  if (profile?.role !== "finance_admin" && purchase.created_by !== profile?.id) throw new Error("Forbidden");

  const { count: movementCount, error: movementError } = await admin
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("reference_type", "purchase_order")
    .eq("reference_id", purchaseId);

  if (movementError) throw new Error(movementError.message);
  if (Number(movementCount ?? 0) > 0 || purchase.status === "received" || purchase.status === "partially_received") {
    throw new Error("This purchase has already affected inventory and cannot be deleted.");
  }

  const { error: deleteError } = await admin.from("purchase_orders").delete().eq("id", purchaseId);
  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/quotations");
  revalidatePath("/dashboard");
}
