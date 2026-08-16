import Link from "next/link";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

function money(value: number) { return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2 }).format(value); }

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const admin = createAdminClient();
  const [quotations, orders, purchases, inventory, products] = await Promise.all([
    admin.from("quotations").select("id, quote_number, customer_name_snapshot, total_sales, status, created_at, created_by").order("created_at", { ascending: false }).limit(8),
    admin.from("orders").select("id, order_number, customer_name_snapshot, total_sales, status, created_at, created_by").order("created_at", { ascending: false }).limit(8),
    admin.from("purchase_orders").select("id, purchase_number, supplier_name_snapshot, total_value_aed, status, created_at, created_by").order("created_at", { ascending: false }).limit(8),
    admin.from("inventory_balances").select("product_id, product_name, quantity_kg").order("quantity_kg", { ascending: true }).limit(8),
    admin.from("products").select("id", { count: "exact", head: true }),
  ]);

  const filterOwn = <T extends { created_by: string }>(rows: T[] | null) => profile?.role === "finance_admin" ? rows ?? [] : (rows ?? []).filter(r => r.created_by === profile?.id);
  const recentQuotes = filterOwn(quotations.data);
  const recentOrders = filterOwn(orders.data);
  const recentPurchases = filterOwn(purchases.data);
  const lowStock = (inventory.data ?? []).filter(x => Number(x.quantity_kg) <= 0).slice(0, 5);

  const quoteSales = recentQuotes.reduce((s, q) => s + Number(q.total_sales), 0);
  const orderSales = recentOrders.reduce((s, o) => s + Number(o.total_sales), 0);
  const purchaseValue = recentPurchases.reduce((s, p) => s + Number(p.total_value_aed), 0);

  return (
    <div className="p-8">
      <div className="mb-8"><h1 className="text-2xl font-semibold">Dashboard</h1><p className="mt-1 text-sm text-zinc-500">Operational overview for {profile?.full_name}.</p></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[['Recent Quotes', recentQuotes.length.toString(), money(quoteSales)], ['Orders', recentOrders.length.toString(), money(orderSales)], ['Purchases', recentPurchases.length.toString(), money(purchaseValue)], ['Products', (products.count ?? 0).toString(), 'active catalog']].map(([label, value, sub]) => <div key={label} className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-sm text-zinc-500">{sub}</p></div>)}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b p-5"><h2 className="font-semibold">Recent Quotations</h2><Link href="/quotations" className="text-sm text-zinc-500 hover:text-zinc-900">View all</Link></div><div className="divide-y">{recentQuotes.length === 0 ? <p className="p-8 text-sm text-zinc-500">No quotations yet.</p> : recentQuotes.slice(0, 5).map(q => <Link key={q.id} href={`/quotations/${q.id}`} className="flex items-center justify-between p-4 hover:bg-zinc-50"><div><p className="text-sm font-medium">{q.quote_number}</p><p className="text-xs text-zinc-500">{q.customer_name_snapshot}</p></div><div className="text-right"><p className="text-sm font-medium">{money(Number(q.total_sales))}</p><p className="text-xs capitalize text-zinc-500">{q.status.replaceAll('_', ' ')}</p></div></Link>)}</div></section>
        <section className="rounded-xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b p-5"><h2 className="font-semibold">Inventory Watch</h2><Link href="/inventory" className="text-sm text-zinc-500 hover:text-zinc-900">View inventory</Link></div><div className="divide-y">{lowStock.length === 0 ? <p className="p-8 text-sm text-zinc-500">No zero/negative stock detected.</p> : lowStock.map(row => <div key={row.product_id} className="flex items-center justify-between p-4"><p className="text-sm font-medium">{row.product_name}</p><p className="text-sm font-medium text-red-600">{Number(row.quantity_kg).toLocaleString()} kg</p></div>)}</div></section>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3"><Link href="/quotations/new" className="rounded-xl border bg-white p-5 shadow-sm hover:bg-zinc-50"><p className="font-medium">New Quotation</p><p className="mt-1 text-sm text-zinc-500">Calculate landed cost and selling price.</p></Link><Link href="/orders" className="rounded-xl border bg-white p-5 shadow-sm hover:bg-zinc-50"><p className="font-medium">Manage Orders</p><p className="mt-1 text-sm text-zinc-500">Convert quotations and track fulfillment.</p></Link><Link href="/purchases" className="rounded-xl border bg-white p-5 shadow-sm hover:bg-zinc-50"><p className="font-medium">Manage Purchases</p><p className="mt-1 text-sm text-zinc-500">Create POs and receive stock.</p></Link></div>
    </div>
  );
}
