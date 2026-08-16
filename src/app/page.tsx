import Link from "next/link";
import { ArrowRight, BarChart3, Boxes, Calculator, ShieldCheck, Truck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/permissions";

const features = [
  { icon: Calculator, title: "Live landed costing", text: "Build customer pricing from real purchase and warehouse costs." },
  { icon: Boxes, title: "Inventory visibility", text: "Track received stock, available quantities and stock movement." },
  { icon: Truck, title: "Purchases & orders", text: "Move from container purchases to sales orders without losing the cost trail." },
  { icon: BarChart3, title: "Margin control", text: "See selling price, profit and margin before committing a quotation." },
];

export default async function Home() {
  const currentUser = await getCurrentUser();
  const user = currentUser?.user;

  return (
    <main className="min-h-screen overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.24),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.10),transparent_30%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-950/40"><Calculator size={20} /></div>
            <div><p className="font-semibold tracking-tight group-hover:text-indigo-300">Hinata</p><p className="text-xs text-zinc-500">Trading Operations</p></div>
          </Link>
          {user ? <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-950 hover:bg-indigo-50">Open Dashboard <ArrowRight size={16} /></Link> : <Link href="/login" className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium hover:border-indigo-400/40 hover:bg-indigo-500/10">Sign in <ArrowRight size={16} /></Link>}
        </header>

        <section className="flex flex-1 items-center py-20 lg:py-24">
          <div className="grid w-full items-center gap-16 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1.5 text-xs text-indigo-200"><ShieldCheck size={14} /> Internal operations platform</div>
              <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">Know your real cost.<br /><span className="text-zinc-400">Quote with confidence.</span></h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">A single workspace for landed costing, purchasing, inventory, quotations and sales orders — built around the numbers that actually matter.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                {user ? <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-950/30 hover:bg-indigo-400">Go to Dashboard <ArrowRight size={17} /></Link> : <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-950/30 hover:bg-indigo-400">Sign in to continue <ArrowRight size={17} /></Link>}
              </div>
            </div>

            <div className="rounded-3xl border border-indigo-400/15 bg-white/[0.045] p-4 shadow-2xl backdrop-blur-sm">
              <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Workflow</p><p className="mt-1 font-medium">From purchase to profit</p></div><div className="rounded-lg bg-emerald-400/10 px-2.5 py-1.5 text-xs text-emerald-300">Live</div></div>
                <div className="space-y-3 pt-5">
                  {["Purchase container", "Receive inventory", "Build costing", "Create order"].map((step, index) => <div key={step} className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] p-4"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold text-white">{index + 1}</div><div className="flex-1"><p className="text-sm font-medium">{step}</p><p className="mt-0.5 text-xs text-zinc-500">{["Allocate landed costs", "Stock becomes available", "Calculate margin in real time", "Fulfill against available stock"][index]}</p></div></div>)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => <div key={title} className="rounded-xl border border-white/8 bg-white/[0.025] p-5"><Icon size={18} className="text-indigo-300" /><h2 className="mt-4 text-sm font-medium">{title}</h2><p className="mt-1.5 text-xs leading-5 text-zinc-500">{text}</p></div>)}
        </section>
      </div>
    </main>
  );
}
