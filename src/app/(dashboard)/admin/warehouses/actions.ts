"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ warehouseId: z.string().uuid(), storageRate: z.coerce.number().nonnegative() });

export async function updateWarehouseStorageRate(formData: FormData) {
  const { profile } = await requireUser();
  if (profile?.role !== "finance_admin") throw new Error("Forbidden");
  const parsed = schema.safeParse({ warehouseId: formData.get("warehouseId"), storageRate: formData.get("storageRate") });
  if (!parsed.success) throw new Error("Invalid warehouse storage rate.");
  const admin = createAdminClient();
  const { error } = await admin.from("warehouses").update({ storage_rate_aed_per_cbm_day: parsed.data.storageRate }).eq("id", parsed.data.warehouseId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/warehouses");
  revalidatePath("/purchases");
}
