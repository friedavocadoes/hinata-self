"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const productSchema = z.object({
  productId: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  supplyType: z.string().trim().min(1),
  packSizeKg: z.coerce.number().positive(),
  cifRateUsd: z.coerce.number().nonnegative(),
  defaultProfitPct: z.coerce.number().min(0).lt(100),
  inwardClearanceCharge: z.coerce.number().nonnegative(),
  storageRate: z.coerce.number().nonnegative(),
  storageDays: z.coerce.number().int().min(0),
  supplierId: z.string().uuid().optional().or(z.literal("")),
  supplierMop: z.string().optional(),
  supplierCreditDays: z.coerce.number().int().min(0),
});

async function requireAdmin() {
  const { profile } = await requireUser();
  if (profile?.role !== "finance_admin") throw new Error("Forbidden");
}

export async function updateProduct(formData: FormData) {
  await requireAdmin();
  const parsed = productSchema.safeParse({
    productId: formData.get("productId") || undefined,
    name: formData.get("name"), supplyType: formData.get("supplyType"), packSizeKg: formData.get("packSizeKg"),
    cifRateUsd: formData.get("cifRateUsd"), defaultProfitPct: formData.get("defaultProfitPct"),
    inwardClearanceCharge: formData.get("inwardClearanceCharge"), storageRate: formData.get("storageRate"), storageDays: formData.get("storageDays"),
    supplierId: formData.get("supplierId"), supplierMop: formData.get("supplierMop") ?? "", supplierCreditDays: formData.get("supplierCreditDays"),
  });
  if (!parsed.success || !parsed.data.productId) throw new Error("Invalid product data.");
  const admin = createAdminClient();
  const { error } = await admin.from("products").update({
    name: parsed.data.name, supply_type: parsed.data.supplyType, pack_size_kg: parsed.data.packSizeKg, cif_rate_usd: parsed.data.cifRateUsd,
    default_profit_pct: parsed.data.defaultProfitPct, inward_clearance_charge: parsed.data.inwardClearanceCharge,
    storage_rate: parsed.data.storageRate, storage_days: parsed.data.storageDays,
    supplier_id: parsed.data.supplierId || null, supplier_mop: parsed.data.supplierMop || null, supplier_credit_days: parsed.data.supplierCreditDays,
  }).eq("id", parsed.data.productId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function createProduct(formData: FormData) {
  await requireAdmin();
  const parsed = productSchema.omit({ productId: true }).safeParse({
    name: formData.get("name"), supplyType: formData.get("supplyType"), packSizeKg: formData.get("packSizeKg"),
    cifRateUsd: formData.get("cifRateUsd"), defaultProfitPct: formData.get("defaultProfitPct"),
    inwardClearanceCharge: formData.get("inwardClearanceCharge"), storageRate: formData.get("storageRate"), storageDays: formData.get("storageDays"),
    supplierId: formData.get("supplierId"), supplierMop: formData.get("supplierMop") ?? "", supplierCreditDays: formData.get("supplierCreditDays"),
  });
  if (!parsed.success) throw new Error("Invalid product data.");
  const admin = createAdminClient();
  const { error } = await admin.from("products").insert({
    name: parsed.data.name, supply_type: parsed.data.supplyType, pack_size_kg: parsed.data.packSizeKg, cif_rate_usd: parsed.data.cifRateUsd,
    default_profit_pct: parsed.data.defaultProfitPct, inward_clearance_charge: parsed.data.inwardClearanceCharge,
    storage_rate: parsed.data.storageRate, storage_days: parsed.data.storageDays,
    supplier_id: parsed.data.supplierId || null, supplier_mop: parsed.data.supplierMop || null, supplier_credit_days: parsed.data.supplierCreditDays,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}

export async function toggleProduct(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("productId"));
  const active = formData.get("active") === "true";
  const admin = createAdminClient();
  const { error } = await admin.from("products").update({ active: !active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/products");
}
