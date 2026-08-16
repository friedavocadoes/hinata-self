import Link from "next/link";
import { Home } from "lucide-react";
import { requireUser } from "@/lib/auth/permissions";
import { LogoutButton } from "@/components/auth/logout-button";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <Link href="/" className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-indigo-50">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm shadow-indigo-200">H</div>
          <div><p className="font-semibold tracking-tight text-zinc-950 transition-colors group-hover:text-indigo-700">Hinata</p><p className="text-[11px] text-zinc-400">Trading Operations</p></div>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/" aria-label="Go to Hinata home" className="hidden h-9 items-center gap-2 rounded-lg px-3 text-sm text-zinc-500 transition-colors hover:bg-indigo-50 hover:text-indigo-700 sm:flex"><Home size={16} /> Home</Link>
          <div className="hidden h-7 w-px bg-zinc-200 sm:block" />
          <div className="text-right"><p className="text-sm font-medium text-zinc-900">{profile?.full_name}</p><p className="text-xs text-zinc-500">{profile?.role === "finance_admin" ? "Finance / Admin" : "Sales Representative"}</p></div>
          <LogoutButton />
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <DashboardSidebar isAdmin={profile?.role === "finance_admin"} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
