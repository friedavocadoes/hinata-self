import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateIncotermRule } from "./actions";

const costLabels: Record<string, string> = {
  inward_clearance: "Inward clearance",
  inward_bank: "IN bank charge",
  storage: "Storage",
  ex_works: "Ex Works",
  outward_clearance: "Outward clearance",
  outward_transport: "Outward transportation",
  freight: "Freight",
  insurance: "Insurance",
  other_expense: "Other expense",
  finance_charge: "Finance charge",
  customs_duty: "Customs duty",
};

export default async function IncotermRulesPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { profile } = await requireUser();
  if (profile?.role !== "finance_admin") throw new Error("Forbidden");
  const params = await searchParams;
  const admin = createAdminClient();

  const [{ data: incoterms, error: incotermError }, { data: rules, error: ruleError }] = await Promise.all([
    admin.from("incoterms").select("id, code, name").eq("active", true).order("code"),
    admin.from("incoterm_cost_rules").select("id, incoterm_code, scope, cost_code, enabled, calculation_type, amount_aed, rate_pct, multiplier, base_code, notes").eq("active", true).order("scope").order("cost_code"),
  ]);
  if (incotermError) throw new Error(incotermError.message);
  if (ruleError) throw new Error(ruleError.message);

  const selected = incoterms?.find((i) => i.code === params.code)?.code ?? incoterms?.[0]?.code;
  const selectedRules = (rules ?? []).filter((rule) => rule.incoterm_code === selected);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Incoterm Cost Rules</h1>
        <p className="mt-1 text-sm text-zinc-500">Control which expenses apply to purchases and selling costings for each incoterm.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(incoterms ?? []).map((incoterm) => (
          <a key={incoterm.id} href={`/admin/incoterms?code=${encodeURIComponent(incoterm.code)}`} className={`rounded-lg border px-3 py-2 text-sm font-medium ${selected === incoterm.code ? "border-zinc-900 bg-zinc-900 text-white" : "bg-white hover:bg-zinc-50"}`}>{incoterm.code}</a>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b p-5"><h2 className="font-semibold">{selected ?? "Incoterm"}</h2><p className="mt-1 text-sm text-zinc-500">Configure purchase and selling behavior independently.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b bg-zinc-50"><tr><th className="px-4 py-3 text-left">Scope</th><th className="px-4 py-3 text-left">Expense</th><th className="px-4 py-3 text-left">Enabled</th><th className="px-4 py-3 text-left">Calculation</th><th className="px-4 py-3 text-right">Fixed AED</th><th className="px-4 py-3 text-right">Rate</th><th className="px-4 py-3 text-right">Multiplier</th><th className="px-4 py-3 text-left">Base</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y">
              {selectedRules.map((rule) => (
                <tr key={rule.id}>
                  <form action={updateIncotermRule}>
                    <td className="px-4 py-3 capitalize">{rule.scope}</td>
                    <td className="px-4 py-3 font-medium">{costLabels[rule.cost_code] ?? rule.cost_code}</td>
                    <td className="px-4 py-3"><input type="checkbox" name="enabled" defaultChecked={rule.enabled} /></td>
                    <td className="px-4 py-3"><select name="calculationType" defaultValue={rule.calculation_type} className="rounded-lg border px-2 py-1.5"><option value="manual">Manual</option><option value="fixed">Fixed</option><option value="percentage">Percentage</option><option value="disabled">Disabled</option></select></td>
                    <td className="px-4 py-3"><input name="amountAed" type="number" min="0" step="0.01" defaultValue={Number(rule.amount_aed)} className="w-28 rounded-lg border px-2 py-1.5 text-right" /></td>
                    <td className="px-4 py-3"><input name="ratePct" type="number" min="0" step="0.000001" defaultValue={Number(rule.rate_pct)} className="w-28 rounded-lg border px-2 py-1.5 text-right" /></td>
                    <td className="px-4 py-3"><input name="multiplier" type="number" min="0.000001" step="0.01" defaultValue={Number(rule.multiplier)} className="w-24 rounded-lg border px-2 py-1.5 text-right" /></td>
                    <td className="px-4 py-3"><select name="baseCode" defaultValue={rule.base_code ?? "manual"} className="rounded-lg border px-2 py-1.5"><option value="manual">Manual</option><option value="ex_works">Ex Works</option><option value="purchase_value">Purchase value</option><option value="sales_value">Sales value</option><option value="quantity">Quantity</option></select></td>
                    <td className="px-4 py-3 text-right"><input type="hidden" name="ruleId" value={rule.id} /><button className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800">Save</button></td>
                  </form>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
