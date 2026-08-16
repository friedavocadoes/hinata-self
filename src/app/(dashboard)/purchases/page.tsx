import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { receivePurchase } from "./actions";
import { deletePurchaseOrder } from "./delete-actions";
import { PurchaseForm } from "@/components/purchase/purchase-form";

function money(value: number) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2 }).format(value);
}

function statusClass(status: string) {
  switch (status) {
    case "ordered": return "bg-blue-50 text-blue-700 ring-blue-600/10";
    case "partially_received": return "bg-amber-50 text-amber-700 ring-amber-600/10";
    case "received": return "bg-emerald-50 text-emerald-700 ring-emerald-600/10";
    case "cancelled": return "bg-red-50 text-red-700 ring-red-600/10";
    default: return "bg-zinc-100 text-zinc-600 ring-zinc-500/10";
  }
}

export default async function PurchasesPage() {
  const { profile } = await requireUser();
  const admin = createAdminClient();

  let query = admin.from("purchase_orders").select("id, purchase_number, supplier_name_snapshot, purchase_date, total_value_aed, total_cost, status, created_by, container_reference, incoterm_code, received_at").order("created_at", { ascending: false });
  if (profile?.role !== "finance_admin") query = query.eq("created_by", profile!.id);

  const [{ data: purchases, error }, { data: suppliers }, { data: products }, { data: warehouses }, { data: incoterms }] = await Promise.all([
    query,
    admin.from("suppliers").select("id, name").order("name"),
    admin.from("products").select("id, name").eq("active", true).order("name"),
    admin.from("warehouses").select("id, name, storage_rate_aed_per_cbm_day").eq("active", true).order("name"),
    admin.from("incoterms").select("id, code, name").eq("active", true).order("code"),
  ]);

  if (error) throw new Error(error.message);

  return (
    <div className="p-8">
      <div className="mb-8"><h1 className="text-2xl font-semibold">Purchases</h1><p className="mt-1 text-sm text-zinc-500">Purchase containers, allocate shared landed costs, receive stock and let storage accrue by product volume.</p></div>

      <PurchaseForm suppliers={suppliers ?? []} products={products ?? []} warehouses={(warehouses ?? []).map((w) => ({ ...w, storage_rate_aed_per_cbm_day: Number(w.storage_rate_aed_per_cbm_day) }))} incoterms={incoterms ?? []} />

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b p-5"><h2 className="font-semibold">Container Purchases</h2></div>
        {(purchases ?? []).length === 0 ? (
          <div className="p-12 text-center text-sm text-zinc-500">No purchases yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b bg-zinc-50"><tr>
                <th className="px-5 py-3 text-left">Purchase</th><th className="px-5 py-3 text-left">Supplier</th><th className="px-5 py-3 text-left">Incoterm</th><th className="px-5 py-3 text-left">Container</th><th className="px-5 py-3 text-left">Date</th><th className="px-5 py-3 text-right">Ex Works</th><th className="px-5 py-3 text-right">Total Cost</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3" />
              </tr></thead>
              <tbody className="divide-y">
                {(purchases ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-4 font-medium">{p.purchase_number}</td>
                    <td className="px-5 py-4">{p.supplier_name_snapshot}</td>
                    <td className="px-5 py-4">{p.incoterm_code ?? "—"}</td>
                    <td className="px-5 py-4">{p.container_reference ?? "—"}</td>
                    <td className="px-5 py-4">{p.purchase_date}</td>
                    <td className="px-5 py-4 text-right">{money(Number(p.total_value_aed))}</td>
                    <td className="px-5 py-4 text-right font-medium">{money(Number(p.total_cost))}</td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${statusClass(p.status)}`}>{p.status.replaceAll("_", " ")}</span></td>
                    <td className="px-5 py-4 text-right"><div className="flex justify-end gap-2">{p.status !== "received" && p.status !== "partially_received" && <form action={receivePurchase.bind(null, p.id)}><button className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50">Receive Stock</button></form>}<form action={deletePurchaseOrder.bind(null, p.id)}><button title="Delete purchase and roll back downstream inventory/order history" className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button></form></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
