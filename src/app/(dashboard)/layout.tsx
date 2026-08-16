import Link from "next/link";
import { requireUser } from "@/lib/auth/permissions";
import { LogoutButton } from "@/components/auth/logout-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="flex h-16 items-center justify-between border-b bg-white px-6">
        <div><span className="font-semibold">Landed Costing</span></div>
        <div className="flex items-center gap-4">
          <div className="text-right"><p className="text-sm font-medium">{profile?.full_name}</p><p className="text-xs text-zinc-500">{profile?.role === "finance_admin" ? "Finance / Admin" : "Sales Representative"}</p></div>
          <LogoutButton />
        </div>
      </header>
      <div className="flex"><aside className="hidden w-64 border-r bg-white lg:block"><nav className="p-4">
        <p className="mb-2 text-xs font-medium uppercase text-zinc-400">Workspace</p>
        <div className="space-y-1 text-sm"><Link href="/dashboard" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">Dashboard</Link><Link href="/quotations" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">Costings</Link><Link href="/orders" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">Orders</Link><Link href="/purchases" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">Purchases</Link><Link href="/inventory" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">Inventory</Link></div>
        {profile?.role === "finance_admin" && <><p className="mb-2 mt-8 text-xs font-medium uppercase text-zinc-400">Administration</p><div className="space-y-1 text-sm"><Link href="/admin/products" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">Products</Link><Link href="/admin/customers" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">Customers</Link><Link href="/admin/transport" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">Transport</Link><Link href="/admin/incoterms" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">Incoterm Costs</Link><Link href="/admin/warehouses" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">Warehouses</Link><Link href="/admin/settings" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">System Settings</Link></div></>}
      </nav></aside><main className="min-w-0 flex-1">{children}</main></div>
    </div>
  );
}
