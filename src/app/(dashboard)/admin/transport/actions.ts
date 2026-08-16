"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() { const { profile } = await requireUser(); if (profile?.role !== "finance_admin") throw new Error("Forbidden"); }

const schema = z.object({ id: z.string().uuid().optional(), destinationId: z.string().uuid(), vehicleTypeId: z.string().uuid(), rateAed: z.coerce.number().nonnegative(), effectiveFrom: z.string().optional() });

export async function createTransportRate(formData: FormData) {
  await requireAdmin();
  const parsed = schema.omit({ id: true }).safeParse({ destinationId: formData.get("destinationId"), vehicleTypeId: formData.get("vehicleTypeId"), rateAed: formData.get("rateAed"), effectiveFrom: formData.get("effectiveFrom") || undefined });
  if (!parsed.success) throw new Error("Invalid transport rate.");
  const { error } = await createAdminClient().from("transport_rates").insert({ destination_id: parsed.data.destinationId, vehicle_type_id: parsed.data.vehicleTypeId, rate_aed: parsed.data.rateAed, effective_from: parsed.data.effectiveFrom || null });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/transport");
}

export async function updateTransportRate(formData: FormData) {
  await requireAdmin();
  const parsed = schema.safeParse({ id: formData.get("id"), destinationId: formData.get("destinationId"), vehicleTypeId: formData.get("vehicleTypeId"), rateAed: formData.get("rateAed"), effectiveFrom: formData.get("effectiveFrom") || undefined });
  if (!parsed.success || !parsed.data.id) throw new Error("Invalid transport rate.");
  const { error } = await createAdminClient().from("transport_rates").update({ destination_id: parsed.data.destinationId, vehicle_type_id: parsed.data.vehicleTypeId, rate_aed: parsed.data.rateAed, effective_from: parsed.data.effectiveFrom || null }).eq("id", parsed.data.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/transport");
}

export async function toggleTransportRate(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const active = formData.get("active") === "true";
  const { error } = await createAdminClient().from("transport_rates").update({ active: !active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/transport");
}
