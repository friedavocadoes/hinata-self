"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  ruleId: z.string().uuid(),
  enabled: z.coerce.boolean(),
  calculationType: z.enum(["manual", "fixed", "percentage", "disabled"]),
  amountAed: z.coerce.number().nonnegative(),
  ratePct: z.coerce.number().nonnegative(),
  multiplier: z.coerce.number().positive(),
  baseCode: z.enum(["ex_works", "purchase_value", "sales_value", "quantity", "manual"]).nullable(),
});

export async function updateIncotermRule(formData: FormData) {
  const { profile } = await requireUser();
  if (profile?.role !== "finance_admin") throw new Error("Forbidden");

  const parsed = schema.safeParse({
    ruleId: formData.get("ruleId"),
    enabled: formData.get("enabled") === "on",
    calculationType: formData.get("calculationType"),
    amountAed: formData.get("amountAed"),
    ratePct: formData.get("ratePct"),
    multiplier: formData.get("multiplier"),
    baseCode: formData.get("baseCode") || null,
  });
  if (!parsed.success) throw new Error("Invalid incoterm rule.");

  const admin = createAdminClient();
  const { error } = await admin.from("incoterm_cost_rules").update({
    enabled: parsed.data.enabled,
    calculation_type: parsed.data.calculationType,
    amount_aed: parsed.data.amountAed,
    rate_pct: parsed.data.ratePct,
    multiplier: parsed.data.multiplier,
    base_code: parsed.data.baseCode,
    updated_at: new Date().toISOString(),
  }).eq("id", parsed.data.ruleId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/incoterms");
  revalidatePath("/quotations/new");
}
