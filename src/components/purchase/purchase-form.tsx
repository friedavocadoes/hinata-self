"use client";

import { useMemo, useState } from "react";
import { createPurchaseOrder } from "@/app/(dashboard)/purchases/actions";

export type PurchaseOption = { id: string; name: string };
export type WarehouseOption = { id: string; name: string; storage_rate_aed_per_cbm_day: number };
export type IncotermOption = { id: string; code: string; name: string };

type PurchaseLine = {
  productId: string;
  qtyKg: number;
  volumeCbm: number;
  unitExWorksCostAed: number;
};

type Props = {
  suppliers: PurchaseOption[];
  products: PurchaseOption[];
  warehouses: WarehouseOption[];
  incoterms: IncotermOption[];
};

function money(value: number) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2 }).format(value);
}

export function PurchaseForm({ suppliers, products, warehouses, incoterms }: Props) {
  const [lines, setLines] = useState<PurchaseLine[]>([{ productId: "", qtyKg: 0, volumeCbm: 0, unitExWorksCostAed: 0 }]);
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);

  const totals = useMemo(() => ({
    exWorks: lines.reduce((sum, line) => sum + line.qtyKg * line.unitExWorksCostAed, 0),
    volume: lines.reduce((sum, line) => sum + line.volumeCbm, 0),
  }), [lines]);

  function updateLine(index: number, patch: Partial<PurchaseLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  return (
    <section className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="font-semibold">New Container Purchase</h2>
        <p className="mt-1 text-sm text-zinc-500">One purchase can contain multiple products. Shared container costs are entered once and allocated by Ex Works value; storage is calculated per product from volume and warehouse days.</p>
      </div>

      <form action={createPurchaseOrder} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <select name="supplierId" required className="rounded-lg border px-3 py-2.5"><option value="">Supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select name="incotermCode" required className="rounded-lg border px-3 py-2.5"><option value="">Purchase Incoterm</option>{incoterms.map((i) => <option key={i.id} value={i.code}>{i.name}</option>)}</select>
          <select name="warehouseId" required value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border px-3 py-2.5"><option value="">Warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
          <input name="containerReference" placeholder="Container / shipment reference" className="rounded-lg border px-3 py-2.5" />
          <input name="paymentTerm" placeholder="Supplier payment term" className="rounded-lg border px-3 py-2.5" />
          <input name="creditDays" type="number" min="0" placeholder="Supplier credit days" className="rounded-lg border px-3 py-2.5" />
          <input name="storageRateAedPerCbmDay" type="number" value={selectedWarehouse?.storage_rate_aed_per_cbm_day ?? 0} readOnly className="rounded-lg border bg-zinc-50 px-3 py-2.5" />
          <div className="rounded-lg border bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600">AED / CBM / day</div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b bg-zinc-50"><tr><th className="px-4 py-3 text-left font-medium">Product</th><th className="px-4 py-3 text-right font-medium">Quantity (kg)</th><th className="px-4 py-3 text-right font-medium">Volume (CBM)</th><th className="px-4 py-3 text-right font-medium">Ex Works / kg</th><th className="px-4 py-3 text-right font-medium">Ex Works Total</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y">
              {lines.map((line, index) => (
                <tr key={index}>
                  <td className="px-4 py-3"><select value={line.productId} onChange={(e) => updateLine(index, { productId: e.target.value })} required className="w-full rounded-lg border px-3 py-2.5"><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                  <td className="px-4 py-3"><input type="number" min="0.01" step="0.01" value={line.qtyKg || ""} onChange={(e) => updateLine(index, { qtyKg: Number(e.target.value) })} required className="w-full rounded-lg border px-3 py-2.5 text-right" /></td>
                  <td className="px-4 py-3"><input type="number" min="0" step="0.001" value={line.volumeCbm || ""} onChange={(e) => updateLine(index, { volumeCbm: Number(e.target.value) })} required className="w-full rounded-lg border px-3 py-2.5 text-right" /></td>
                  <td className="px-4 py-3"><input type="number" min="0" step="0.0001" value={line.unitExWorksCostAed || ""} onChange={(e) => updateLine(index, { unitExWorksCostAed: Number(e.target.value) })} required className="w-full rounded-lg border px-3 py-2.5 text-right" /></td>
                  <td className="px-4 py-3 text-right font-medium">{money(line.qtyKg * line.unitExWorksCostAed)}</td>
                  <td className="px-4 py-3 text-right">{lines.length > 1 && <button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="text-xs font-medium text-red-600 hover:underline">Remove</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-zinc-50"><tr><td className="px-4 py-3 font-medium">Container total</td><td /><td className="px-4 py-3 text-right font-medium">{totals.volume.toFixed(3)} CBM</td><td /><td className="px-4 py-3 text-right font-semibold">{money(totals.exWorks)}</td><td /></tr></tfoot>
          </table>
        </div>

        <button type="button" onClick={() => setLines((current) => [...current, { productId: "", qtyKg: 0, volumeCbm: 0, unitExWorksCostAed: 0 }])} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-zinc-50">+ Add Product</button>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <input name="inwardClearanceCharge" type="number" min="0" step="0.01" placeholder="Inward clearance charge" className="rounded-lg border px-3 py-2.5" />
          <input name="inwardBankCharge" type="number" min="0" step="0.01" placeholder="IN bank charge" className="rounded-lg border px-3 py-2.5" />
          <input name="outwardClearanceCharge" type="number" min="0" step="0.01" placeholder="Outward clearance charge" className="rounded-lg border px-3 py-2.5" />
          <input name="outwardTransportCharge" type="number" min="0" step="0.01" placeholder="Outward transportation charge" className="rounded-lg border px-3 py-2.5" />
          <input name="freight" type="number" min="0" step="0.01" placeholder="Freight" className="rounded-lg border px-3 py-2.5" />
          <input name="insurance" type="number" min="0" step="0.01" placeholder="Insurance" className="rounded-lg border px-3 py-2.5" />
          <input name="otherExpense" type="number" min="0" step="0.01" placeholder="Other expense" className="rounded-lg border px-3 py-2.5" />
          <input name="financeCharge" type="number" min="0" step="0.01" placeholder="Finance charge" className="rounded-lg border px-3 py-2.5" />
        </div>

        <input type="hidden" name="items" value={JSON.stringify(lines)} />
        <div className="flex items-center justify-between rounded-xl border bg-zinc-50 p-4"><div className="text-sm text-zinc-600">Storage accrues after receipt and is calculated per product from CBM × warehouse rate × days.</div><button className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">Create Container Purchase</button></div>
      </form>
    </section>
  );
}
