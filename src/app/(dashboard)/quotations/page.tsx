import Link from "next/link";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeQuotation } from "./remove-actions";

function money(value: number) { return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2 }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-AE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function statusClass(status: string) { switch (status) { case "won": return "bg-emerald-50 text-emerald-700"; case "lost": case "cancelled": return "bg-red-50 text-red-700"; case "sent": return "bg-blue-50 text-blue-700"; case "pending_approval": return "bg-amber-50 text-amber-700"; default: return "bg-zinc-100 text-zinc-600"; } }

export default async function QuotationsPage() {
  const { profile } = await requireUser();
  const admin = createAdminClient();
  let query = admin.from("quotations").select("id, quote_number, customer_name_snapshot, quote_date, destination_name_snapshot, total_sales, total_profit, final_margin_pct, status, created_at, created_by").order("created_at", { ascending: false }).limit(100);
  if (profile?.role !== "finance_admin") query = query.eq("created_by", profile!.id);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const quotations = data ?? [];

  return <div className="p-8">
    <div className="mb-8 flex items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Costings</h1><p className="mt-1 text-sm text-zinc-500">Calculate customer selling prices from actual received purchase costs and warehouse age.</p></div><Link href="/quotations/new" className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">+ New Costing</Link></div>
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">{quotations.length === 0 ? <div className="px-6 py-16 text-center"><p className="font-medium">No costings yet</p><p className="mt-1 text-sm text-zinc-500">Create your first costing from received inventory.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="border-b bg-zinc-50"><tr><th className="px-5 py-3 text-left font-medium">Costing</th><th className="px-5 py-3 text-left font-medium">Customer</th><th className="px-5 py-3 text-left font-medium">Date</th><th className="px-5 py-3 text-left font-medium">Destination</th><th className="px-5 py-3 text-right font-medium">Sales</th>{profile?.role === "finance_admin" && <><th className="px-5 py-3 text-right font-medium">Profit</th><th className="px-5 py-3 text-right font-medium">Margin</th></>}<th className="px-5 py-3 text-left font-medium">Status</th><th className="px-5 py-3 text-right font-medium">Action</th></tr></thead><tbody className="divide-y">{quotations.map((quotation) => <tr key={quotation.id} className="hover:bg-zinc-50"><td className="px-5 py-4"><Link href={`/quotations/${quotation.id}`} className="font-medium text-zinc-900 hover:underline">{quotation.quote_number}</Link></td><td className="px-5 py-4">{quotation.customer_name_snapshot}</td><td className="px-5 py-4 text-zinc-500">{formatDate(quotation.quote_date)}</td><td className="px-5 py-4">{quotation.destination_name_snapshot ?? "—"}</td><td className="px-5 py-4 text-right font-medium">{money(Number(quotation.total_sales))}</td>{profile?.role === "finance_admin" && <><td className="px-5 py-4 text-right">{money(Number(quotation.total_profit))}</td><td className="px-5 py-4 text-right">{Number(quotation.final_margin_pct).toFixed(2)}%</td></>}<td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(quotation.status)}`}>{quotation.status.replaceAll("_", " ")}</span></td><td className="px-5 py-4 text-right"><form action={removeQuotation.bind(null, quotation.id)}><button className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button></form></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
