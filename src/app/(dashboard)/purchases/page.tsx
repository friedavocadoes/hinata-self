import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPurchaseOrder, receivePurchase } from "./actions";

function money(value: number) { return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2 }).format(value); }

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
  let query = admin.from("purchase_orders").select("id, purchase_number, supplier_name_snapshot, purchase_date, total_value_aed, status, created_by").order("created_at", { ascending: false });
  if (profile?.role !== "finance_admin") query = query.eq("created_by", profile!.id);
  const [{ data: purchases, error }, { data: suppliers }, { data: products }] = await Promise.all([query, admin.from("suppliers").select("id, name").order("name"), admin.from("products").select("id, name").eq("active", true).order("name")]);
  if (error) throw new Error(error.message);

  return (
    <div className="p-8">
      <div className="mb-8"><h1 className="text-2xl font-semibold">Purchases</h1><p className="mt-1 text-sm text-zinc-500">Create purchase orders and receive stock into inventory.</p></div>
      <section className="mb-6 rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">New Purchase Order</h2><form action={createPurchaseOrder} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><select name="supplierId" required className="rounded-lg border px-3 py-2.5"><option value="">Supplier</option>{(suppliers ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select name="productId" required className="rounded-lg border px-3 py-2.5"><option value="">Product</option>{(products ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input name="qtyKg" required type="number" min="0.01" step="0.01" placeholder="Quantity (kg)" className="rounded-lg border px-3 py-2.5" /><input name="unitPriceAed" required type="number" min="0" step="0.0001" placeholder="Unit purchase price (AED)" className="rounded-lg border px-3 py-2.5" /><input name="paymentTerm" placeholder="Supplier payment term" className="rounded-lg border px-3 py-2.5" /><input name="creditDays" type="number" min="0" placeholder="Credit days" className="rounded-lg border px-3 py-2.5" /><button className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">Create Purchase</button></form></section>
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-semibold">Purchase Orders</h2></div>{(purchases ?? []).length === 0 ? <div className="p-12 text-center text-sm text-zinc-500">No purchases yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="border-b bg-zinc-50"><tr><th className="px-5 py-3 text-left">Purchase</th><th className="px-5 py-3 text-left">Supplier</th><th className="px-5 py-3 text-left">Date</th><th className="px-5 py-3 text-right">Value</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y">{(purchases ?? []).map(p => <tr key={p.id} className="hover:bg-zinc-50"><td className="px-5 py-4 font-medium">{p.purchase_number}</td><td className="px-5 py-4">{p.supplier_name_snapshot}</td><td className="px-5 py-4">{p.purchase_date}</td><td className="px-5 py-4 text-right">{money(Number(p.total_value_aed))}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${statusClass(p.status)}`}>{p.status.replaceAll("_", " ")}</span></td><td className="px-5 py-4 text-right">{p.status !== "received" && <form action={receivePurchase.bind(null, p.id)}><button className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50">Receive Stock</button></form>}</td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}
