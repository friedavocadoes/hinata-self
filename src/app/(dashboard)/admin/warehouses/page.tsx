import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateWarehouseStorageRate } from "./actions";

export default async function WarehousesPage() {
  const { profile } = await requireUser();
  if (profile?.role !== "finance_admin") throw new Error("Forbidden");
  const admin = createAdminClient();
  const { data: warehouses, error } = await admin.from("warehouses").select("id, name, location, storage_rate_aed_per_cbm_day, active").order("name");
  if (error) throw new Error(error.message);

  return (
    <div className="p-8">
      <div className="mb-8"><h1 className="text-2xl font-semibold">Warehouses</h1><p className="mt-1 text-sm text-zinc-500">Set the storage rate used to accrue product storage by CBM and warehouse days.</p></div>
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm"><thead className="border-b bg-zinc-50"><tr><th className="px-5 py-3 text-left">Warehouse</th><th className="px-5 py-3 text-left">Location</th><th className="px-5 py-3 text-right">AED / CBM / Day</th><th className="px-5 py-3" /></tr></thead>
        <tbody className="divide-y">{(warehouses ?? []).map((warehouse) => <tr key={warehouse.id}><td className="px-5 py-4 font-medium">{warehouse.name}</td><td className="px-5 py-4">{warehouse.location ?? "—"}</td><td className="px-5 py-4 text-right"><form id={`warehouse-${warehouse.id}`} action={updateWarehouseStorageRate}><input form={`warehouse-${warehouse.id}`} type="hidden" name="warehouseId" value={warehouse.id} /><input form={`warehouse-${warehouse.id}`} name="storageRate" type="number" min="0" step="0.0001" defaultValue={Number(warehouse.storage_rate_aed_per_cbm_day)} className="w-36 rounded-lg border px-3 py-2 text-right" /></form></td><td className="px-5 py-4 text-right"><button form={`warehouse-${warehouse.id}`} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800">Save</button></td></tr>)}</tbody>
      </table></section>
    </div>
  );
}
