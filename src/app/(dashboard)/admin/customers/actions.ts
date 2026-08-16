"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1), code: z.string().trim().optional(), email: z.string().trim().optional(), phone: z.string().trim().optional(), region: z.string().trim().optional(), address: z.string().trim().optional(), taxRegistrationNo: z.string().trim().optional(), notes: z.string().optional() });

async function requireAdmin() { const { profile } = await requireUser(); if (profile?.role !== "finance_admin") throw new Error("Forbidden"); }

export async function createCustomer(formData: FormData) {
  await requireAdmin();
  const parsed = schema.omit({ id: true }).safeParse({ name: formData.get("name"), code: formData.get("code") ?? "", email: formData.get("email") ?? "", phone: formData.get("phone") ?? "", region: formData.get("region") ?? "", address: formData.get("address") ?? "", taxRegistrationNo: formData.get("taxRegistrationNo") ?? "", notes: formData.get("notes") ?? "" });
  if (!parsed.success) throw new Error("Invalid customer data.");
  const { error } = await createAdminClient().from("customers").insert({ name: parsed.data.name, code: parsed.data.code || null, email: parsed.data.email || null, phone: parsed.data.phone || null, region: parsed.data.region || null, address: parsed.data.address || null, tax_registration_no: parsed.data.taxRegistrationNo || null, notes: parsed.data.notes || null });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}

export async function updateCustomer(formData: FormData) {
  await requireAdmin();
  const parsed = schema.safeParse({ id: formData.get("id"), name: formData.get("name"), code: formData.get("code") ?? "", email: formData.get("email") ?? "", phone: formData.get("phone") ?? "", region: formData.get("region") ?? "", address: formData.get("address") ?? "", taxRegistrationNo: formData.get("taxRegistrationNo") ?? "", notes: formData.get("notes") ?? "" });
  if (!parsed.success || !parsed.data.id) throw new Error("Invalid customer data.");
  const { error } = await createAdminClient().from("customers").update({ name: parsed.data.name, code: parsed.data.code || null, email: parsed.data.email || null, phone: parsed.data.phone || null, region: parsed.data.region || null, address: parsed.data.address || null, tax_registration_no: parsed.data.taxRegistrationNo || null, notes: parsed.data.notes || null }).eq("id", parsed.data.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}

export async function toggleCustomer(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const active = formData.get("active") === "true";
  const { error } = await createAdminClient().from("customers").update({ active: !active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}
