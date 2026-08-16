"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearPurchaseHistory } from "@/lib/inventory/revert-history";

export async function deletePurchaseOrder(purchaseId: string) {
  const { profile } = await requireUser();
  const parsed = z.string().uuid().safeParse(purchaseId);
  if (!parsed.success) throw new Error("Invalid purchase order.");

  const admin = createAdminClient();
  const { data: purchase, error } = await admin
    .from("purchase_orders")
    .select("id, created_by")
    .eq("id", purchaseId)
    .single();

  if (error || !purchase) throw new Error(error?.message ?? "Purchase order not found.");
  if (profile?.role !== "finance_admin" && purchase.created_by !== profile?.id) throw new Error("Forbidden");

  // A purchase may already have received stock and may even have supplied
  // fulfilled orders. Clear that downstream history first, then remove the
  // purchase's own inventory movements and rows.
  await clearPurchaseHistory(admin, purchaseId);

  const { error: deleteError } = await admin
    .from("purchase_orders")
    .delete()
    .eq("id", purchaseId);

  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/quotations");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}
