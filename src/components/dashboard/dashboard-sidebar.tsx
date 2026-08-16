"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Boxes, ChevronLeft, ChevronRight, ClipboardList, Database, LayoutDashboard, Package, Settings, ShoppingCart, Truck, Users, Warehouse } from "lucide-react";

type Props = { isAdmin: boolean };

type NavItem = { href: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> };

const workspace: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/quotations", label: "Costings", icon: BarChart3 },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/inventory", label: "Inventory", icon: Boxes },
];

const administration: NavItem[] = [
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/transport", label: "Transport", icon: Truck },
  { href: "/admin/incoterms", label: "Incoterm Costs", icon: Database },
  { href: "/admin/warehouses", label: "Warehouses", icon: Warehouse },
  { href: "/admin/settings", label: "System Settings", icon: Settings },
];

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const Icon = item.icon;
  const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
        active ? "bg-indigo-50 text-indigo-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
      }`}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.9} />
      <span className={`whitespace-nowrap transition-opacity ${collapsed ? "opacity-0" : "opacity-100"}`}>{item.label}</span>
    </Link>
  );
}

export function DashboardSidebar({ isAdmin }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const isExpanded = !collapsed || hoverExpanded;

  return (
    <aside
      onMouseEnter={() => collapsed && setHoverExpanded(true)}
      onMouseLeave={() => setHoverExpanded(false)}
      className={`relative shrink-0 border-r border-zinc-200 bg-white transition-[width] duration-200 ease-out ${isExpanded ? "w-64" : "w-[68px]"}`}
    >
      <div className="sticky top-0 flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 pb-3 pt-5">
          <span className={`px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400 transition-opacity ${isExpanded ? "opacity-100" : "opacity-0"}`}>Workspace</span>
          <button
            type="button"
            onClick={() => { setCollapsed((value) => !value); setHoverExpanded(false); }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="space-y-1 px-3">
          {workspace.map((item) => <SidebarLink key={item.href} item={item} collapsed={!isExpanded} />)}
        </nav>

        {isAdmin && (
          <>
            <div className={`mx-5 my-5 h-px bg-zinc-100 transition-opacity ${isExpanded ? "opacity-100" : "opacity-0"}`} />
            <div className={`px-5 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400 transition-opacity ${isExpanded ? "opacity-100" : "opacity-0"}`}>Administration</div>
            <nav className="space-y-1 px-3">
              {administration.map((item) => <SidebarLink key={item.href} item={item} collapsed={!isExpanded} />)}
            </nav>
          </>
        )}

        <div className={`mt-auto px-5 pb-5 text-xs text-zinc-400 transition-opacity ${isExpanded ? "opacity-100" : "opacity-0"}`}>
          Hinata Operations
        </div>
      </div>
    </aside>
  );
}
