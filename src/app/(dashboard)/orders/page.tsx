import Link from "next/link";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderFromQuotation } from "./actions";
import { removeOrder } from "./remove-actions";

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

export default async function OrdersPage() {
  const { profile } = await requireUser();
  const admin = createAdminClient();
  let query = admin.from("orders").select("id, order_number, customer_name_snapshot, order_date, destination_name_snapshot, total_sales, total_profit, status, created_by").order("created_at", { ascending: false });
  if (profile?.role !== "finance_admin") query = query.eq("created_by", profile!.id);
  const { data: orders, error } = await query;
  if (error) throw new Error(error.message);
  const { data: quotations } = await admin.from("quotations").select("id, quote_number, customer_name_snapshot, total_sales, status, created_by").eq("status", "draft").order("created_at", { ascending: false });

  return (
    <div className="p-8">
      <div className="mb-8"><h1 className="text-2xl font-semibold">Orders</h1><p className="mt-1 text-sm text-zinc-500">Track confirmed sales orders and fulfillment.</p></div>
      {quotations && quotations.length > 0 && (
        <section className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Convert quotation to order</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {quotations.filter(q => profile?.role === "finance_admin" || q.created_by === profile?.id).map((q) => (
              <form key={q.id} action={createOrderFromQuotation.bind(null, q.id)} className="rounded-lg border p-4">
                <p className="text-sm font-medium">{q.quote_number}</p><p className="mt-1 text-sm text-zinc-500">{q.customer_name_snapshot}</p><p className="mt-2 text-sm font-medium">{money(Number(q.total_sales))}</p>
                <button className="mt-4 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">Create Order</button>
              </form>
            ))}
          </div>
        </section>
      )}
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b p-5"><h2 className="font-semibold">Sales Orders</h2></div>
        {(orders ?? []).length === 0 ? <div className="p-12 text-center text-sm text-zinc-500">No orders yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead className="border-b bg-zinc-50"><tr><th className="px-5 py-3 text-left">Order</th><th className="px-5 py-3 text-left">Customer</th><th className="px-5 py-3 text-left">Date</th><th className="px-5 py-3 text-left">Destination</th><th className="px-5 py-3 text-right">Sales</th><th className="px-5 py-3 text-left">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y">{(orders ?? []).map(order => <tr key={order.id} className="hover:bg-zinc-50"><td className="px-5 py-4"><Link href={`/orders/${order.id}`} className="font-medium hover:underline">{order.order_number}</Link></td><td className="px-5 py-4">{order.customer_name_snapshot}</td><td className="px-5 py-4">{order.order_date}</td><td className="px-5 py-4">{order.destination_name_snapshot ?? "—"}</td><td className="px-5 py-4 text-right font-medium">{money(Number(order.total_sales))}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${statusClass(order.status)}`}>{order.status.replaceAll("_", " ")}</span></td><td className="px-5 py-4 text-right"><form action={removeOrder.bind(null, order.id)}><button className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button></form></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
