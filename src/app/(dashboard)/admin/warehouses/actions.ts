"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() { const { profile } = await requireUser(); if (profile?.role !== "finance_admin") throw new Error("Forbidden"); }

const rateSchema = z.object({ warehouseId: z.string().uuid(), storageRate: z.coerce.number().nonnegative() });
const createSchema = z.object({ name: z.string().trim().min(1), location: z.string().trim().optional(), storageRate: z.coerce.number().nonnegative() });

export async function updateWarehouseStorageRate(formData: FormData) {
  await requireAdmin();
  const parsed = rateSchema.safeParse({ warehouseId: formData.get("warehouseId"), storageRate: formData.get("storageRate") });
  if (!parsed.success) throw new Error("Invalid warehouse storage rate.");
  const { error } = await createAdminClient().from("warehouses").update({ storage_rate_aed_per_cbm_day: parsed.data.storageRate }).eq("id", parsed.data.warehouseId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/warehouses"); revalidatePath("/purchases"); revalidatePath("/quotations/new");
}

export async function createWarehouse(formData: FormData) {
  await requireAdmin();
  const parsed = createSchema.safeParse({ name: formData.get("name"), location: formData.get("location") ?? "", storageRate: formData.get("storageRate") });
  if (!parsed.success) throw new Error("Invalid warehouse data.");
  const { error } = await createAdminClient().from("warehouses").insert({ name: parsed.data.name, location: parsed.data.location || null, storage_rate_aed_per_cbm_day: parsed.data.storageRate, active: true });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/warehouses"); revalidatePath("/purchases");
}

export async function toggleWarehouse(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("warehouseId"));
  const active = formData.get("active") === "true";
  const { error } = await createAdminClient().from("warehouses").update({ active: !active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/warehouses");
}
