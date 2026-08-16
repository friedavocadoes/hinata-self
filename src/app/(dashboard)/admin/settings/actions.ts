"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() { const { profile } = await requireUser(); if (profile?.role !== "finance_admin") throw new Error("Forbidden"); }

const schema = z.object({ id: z.string().uuid(), settingValue: z.coerce.number().finite(), description: z.string().optional() });

export async function updateSetting(formData: FormData) {
  await requireAdmin();
  const parsed = schema.safeParse({ id: formData.get("id"), settingValue: formData.get("settingValue"), description: formData.get("description") ?? "" });
  if (!parsed.success) throw new Error("Invalid system setting.");
  const { error } = await createAdminClient().from("global_settings").update({ setting_value: parsed.data.settingValue, description: parsed.data.description || null, updated_at: new Date().toISOString() }).eq("id", parsed.data.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/settings");
  revalidatePath("/quotations/new");
}
