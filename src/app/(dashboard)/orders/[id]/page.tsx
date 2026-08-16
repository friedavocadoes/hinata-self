import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateOrderStatus } from "../actions";

function money(value: number) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2 }).format(value);
}

function statusClass(status: string) {
  switch (status) {
    case "confirmed": return "bg-blue-50 text-blue-700 ring-blue-600/10";
    case "partially_fulfilled": return "bg-amber-50 text-amber-700 ring-amber-600/10";
    case "fulfilled": return "bg-emerald-50 text-emerald-700 ring-emerald-600/10";
    case "cancelled": return "bg-red-50 text-red-700 ring-red-600/10";
    default: return "bg-zinc-100 text-zinc-600 ring-zinc-500/10";
  }
}

function actionClass(status: string) {
  switch (status) {
    case "confirmed": return "border-blue-200 text-blue-700 hover:bg-blue-50";
    case "partially_fulfilled": return "border-amber-200 text-amber-700 hover:bg-amber-50";
    case "fulfilled": return "border-emerald-200 text-emerald-700 hover:bg-emerald-50";
    case "cancelled": return "border-red-200 text-red-700 hover:bg-red-50";
    default: return "border-zinc-200 text-zinc-700 hover:bg-zinc-50";
  }
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireUser();
  const { id } = await params;
  const admin = createAdminClient();
  const { data: order, error } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) notFound();
  if (profile?.role !== "finance_admin" && order.created_by !== profile?.id) notFound();
  const { data: items } = await admin.from("order_items").select("*").eq("order_id", id).order("created_at");

  return (
    <div className="p-8">
      <Link href="/orders" className="text-sm text-zinc-500 hover:text-zinc-900">← Orders</Link>
      <div className="mb-8 mt-2 flex items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">{order.order_number}</h1><p className="mt-1 text-sm text-zinc-500">Sales order and fulfillment status.</p></div>
        <div className="flex flex-wrap gap-2">
          {(["confirmed", "partially_fulfilled", "fulfilled", "cancelled"] as const).map(status => <form key={status} action={updateOrderStatus.bind(null, id, status)}><button className={`rounded-lg border bg-white px-3 py-2 text-xs font-medium capitalize ${actionClass(status)}`}>{status.replaceAll("_", " ")}</button></form>)}
        </div>
      </div>

      <section className="rounded-xl border bg-white p-6 shadow-sm"><div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs uppercase tracking-wide text-zinc-400">Customer</p><p className="mt-1 font-medium">{order.customer_name_snapshot}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-zinc-400">Destination</p><p className="mt-1 font-medium">{order.destination_name_snapshot ?? "—"}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-zinc-400">Payment</p><p className="mt-1 font-medium">{order.pay_term_code ?? "—"}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-zinc-400">Status</p><p className="mt-1"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${statusClass(order.status)}`}>{order.status.replaceAll("_", " ")}</span></p></div>
      </div></section>

      <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-semibold">Order Items</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="border-b bg-zinc-50"><tr><th className="px-5 py-3 text-left">Product</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3 text-right">Unit Price</th><th className="px-5 py-3 text-right">Sales</th><th className="px-5 py-3 text-right">Cost</th></tr></thead><tbody className="divide-y">{(items ?? []).map(item => <tr key={item.id}><td className="px-5 py-4 font-medium">{item.product_name_snapshot}</td><td className="px-5 py-4 text-right">{Number(item.qty_kg).toLocaleString()} kg</td><td className="px-5 py-4 text-right">{money(Number(item.unit_selling_price))}</td><td className="px-5 py-4 text-right">{money(Number(item.total_sales))}</td><td className="px-5 py-4 text-right">{money(Number(item.total_cost))}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}
