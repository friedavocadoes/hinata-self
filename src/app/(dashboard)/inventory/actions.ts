"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ productId: z.string().uuid(), warehouseId: z.string().uuid().optional(), movementType: z.enum(["adjustment_in", "adjustment_out", "return_in", "return_out", "transfer_in", "transfer_out"]), quantityKg: z.coerce.number().positive(), unitCostAed: z.coerce.number().nonnegative().optional(), notes: z.string().max(500).optional() });

export async function createInventoryAdjustment(formData: FormData) {
  const { profile } = await requireUser();
  if (!profile) throw new Error("Unauthorized");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid inventory movement.");
  const input = parsed.data;
  const admin = createAdminClient();
  const { error } = await admin.from("inventory_movements").insert({ product_id: input.productId, warehouse_id: input.warehouseId || null, movement_type: input.movementType, quantity_kg: input.quantityKg, unit_cost_aed: input.unitCostAed ?? null, notes: input.notes || null, created_by: profile.id, reference_type: "manual" });
  if (error) throw new Error(error.message);
}
