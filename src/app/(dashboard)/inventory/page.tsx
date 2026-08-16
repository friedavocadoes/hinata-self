import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInventoryAdjustment } from "./actions";

export default async function InventoryPage() {
  await requireUser();
  const admin = createAdminClient();
  const [{ data: balances, error }, { data: products }, { data: warehouses }] = await Promise.all([
    admin.from("inventory_balances").select("product_id, product_name, quantity_kg").order("product_name"),
    admin.from("products").select("id, name").eq("active", true).order("name"),
    admin.from("warehouses").select("id, name").eq("active", true).order("name"),
  ]);
  if (error) throw new Error(error.message);

  const totalKg = (balances ?? []).reduce((sum, row) => sum + Number(row.quantity_kg), 0);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-end justify-between"><div><h1 className="text-2xl font-semibold">Inventory</h1><p className="mt-1 text-sm text-zinc-500">Live stock balance from purchases, sales and adjustments.</p></div><div className="rounded-xl border bg-white px-5 py-3 text-right shadow-sm"><p className="text-xs uppercase tracking-wide text-zinc-400">Total Stock</p><p className="text-lg font-semibold">{totalKg.toLocaleString()} kg</p></div></div>

      <section className="mb-6 rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Stock Adjustment</h2><form action={createInventoryAdjustment} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3"><select name="productId" required className="rounded-lg border px-3 py-2.5"><option value="">Product</option>{(products ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select name="warehouseId" className="rounded-lg border px-3 py-2.5"><option value="">Warehouse (optional)</option>{(warehouses ?? []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select><select name="movementType" required className="rounded-lg border px-3 py-2.5"><option value="adjustment_in">Adjustment In</option><option value="adjustment_out">Adjustment Out</option><option value="return_in">Return In</option><option value="return_out">Return Out</option><option value="transfer_in">Transfer In</option><option value="transfer_out">Transfer Out</option></select><input name="quantityKg" required type="number" min="0.01" step="0.01" placeholder="Quantity (kg)" className="rounded-lg border px-3 py-2.5" /><input name="unitCostAed" type="number" min="0" step="0.0001" placeholder="Unit cost (AED)" className="rounded-lg border px-3 py-2.5" /><input name="notes" placeholder="Notes" className="rounded-lg border px-3 py-2.5" /><button className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">Post Movement</button></form></section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-semibold">Current Stock</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead className="border-b bg-zinc-50"><tr><th className="px-5 py-3 text-left">Product</th><th className="px-5 py-3 text-right">Quantity</th><th className="px-5 py-3 text-left">Unit</th></tr></thead><tbody className="divide-y">{(balances ?? []).map(row => <tr key={row.product_id}><td className="px-5 py-4 font-medium">{row.product_name}</td><td className={`px-5 py-4 text-right font-medium ${Number(row.quantity_kg) < 0 ? "text-red-600" : ""}`}>{Number(row.quantity_kg).toLocaleString()}</td><td className="px-5 py-4 text-zinc-500">kg</td></tr>)}</tbody></table></div></section>
    </div>
  );
}
