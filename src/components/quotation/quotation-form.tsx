"use client";

import {
  calculateQuotation,
  getCustomerProducts,
  getVehicleTypes,
  previewQuotation,
} from "@/app/(dashboard)/quotations/new/actions";
import { getProductStockLevels } from "@/app/(dashboard)/quotations/remove-actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Calculator, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";

const quotationSchema = z.object({
  customerId: z.string().uuid("Customer is required"),
  deliveryType: z.enum(["local", "export"]),
  destinationId: z.string().uuid("Destination is required"),
  incoterm: z.string().uuid("Incoterm is required"),
  paymentTerm: z.string().uuid("Payment term is required"),
  creditDays: z.number().finite().min(0, "Credit days cannot be negative"),
  items: z.array(z.object({
    productId: z.string().uuid("Product is required"),
    quantityKg: z.number().finite().positive("Quantity must be greater than zero"),
    targetProfitPct: z.number().finite().min(0).lt(100),
  })).min(1),
});

type QuotationFormValues = z.infer<typeof quotationSchema>;
type Option = { id: string; name: string };
type CalculationResult = Awaited<ReturnType<typeof calculateQuotation>>;
type PreviewResult = Awaited<ReturnType<typeof previewQuotation>>;
type CostingItem = Extract<PreviewResult, { success: true; role: "finance_admin" }>["items"][number];
type CostOverrides = { warehouseDays?: number; transport?: number; other?: number };

type Props = {
  customers: Option[];
  destinations: Option[];
  incoterms: Option[];
  paymentTerms: Option[];
  products: Option[];
};

function money(value: number) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat("en-AE", { maximumFractionDigits: 2 }).format(value);
}

function getVehicleIdForQuantity(quantityKg: number, vehicles: Option[]) {
  const capacity = (name: string) => {
    const match = name.match(/([0-9]+)\s*T/i);
    return match ? Number(match[1]) * 1000 : Number.MAX_SAFE_INTEGER;
  };
  const ordered = [...vehicles].sort((a, b) => capacity(a.name) - capacity(b.name));
  for (const vehicle of ordered) {
    const vehicleCapacity = capacity(vehicle.name);
    if (vehicleCapacity !== Number.MAX_SAFE_INTEGER && quantityKg <= vehicleCapacity) return vehicle.id;
  }
  return ordered.find((vehicle) => /trailer/i.test(vehicle.name))?.id ?? "";
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-500">{message}</p>;
}

function SuccessItem({ item }: { item: CostingItem }) {
  return <>{item.productName}</>;
}

export function QuotationForm({ customers, destinations, incoterms, paymentTerms, products }: Props) {
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [loadingStock, setLoadingStock] = useState(true);
  const [vehicleTypes, setVehicleTypes] = useState<Option[]>([]);
  const [productStock, setProductStock] = useState<Record<string, number>>({});
  const [customerProducts, setCustomerProducts] = useState<Awaited<ReturnType<typeof getCustomerProducts>>>([]);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<number, CostOverrides>>({});

  useEffect(() => {
    getVehicleTypes().then(setVehicleTypes).catch(() => setVehicleTypes([])).finally(() => setLoadingVehicles(false));
    getProductStockLevels().then(setProductStock).catch(() => setProductStock({})).finally(() => setLoadingStock(false));
  }, []);

  const { register, control, handleSubmit, setValue, formState: { errors } } = useForm<QuotationFormValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: { deliveryType: "local", creditDays: 0, items: [{ productId: "", quantityKg: 0, targetProfitPct: 5 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchedValues = useWatch({ control });
  const watchedItems = watchedValues.items ?? [];
  const customerId = watchedValues.customerId;
  const deliveryType = watchedValues.deliveryType ?? "local";
  const destinationId = watchedValues.destinationId;
  const incoterm = watchedValues.incoterm;
  const paymentTerm = watchedValues.paymentTerm;
  const creditDays = watchedValues.creditDays ?? 0;

  const productOptions = useMemo(() => {
    const matched = customerProducts.filter((item) => item.product_id && item.product_match_status === "matched").map((item) => ({ id: item.product_id as string, name: item.product_name_original }));
    const unique = Array.from(new Map(matched.map((item) => [item.id, item])).values());
    const ids = new Set(unique.map((item) => item.id));
    const combined = [...unique, ...products.filter((product) => !ids.has(product.id))];
    return combined.map((product) => {
      const stock = productStock[product.id] ?? 0;
      if (loadingStock) return product;
      return { ...product, name: stock <= 0 ? `🔴 ${product.name} — OUT OF STOCK` : `${product.name} — ${number(stock)} kg available` };
    });
  }, [customerProducts, products, productStock, loadingStock]);

  async function handleCustomerChange(nextCustomerId: string) {
    setValue("customerId", nextCustomerId, { shouldValidate: true, shouldDirty: true });
    setValue("items", [{ productId: "", quantityKg: 0, targetProfitPct: 5 }]);
    setOverrides({});
    setPreviewResult(null);
    setResult(null);
    setSubmitError(null);
    if (!nextCustomerId) {
      setCustomerProducts([]);
      return;
    }
    try {
      setCustomerProducts(await getCustomerProducts(nextCustomerId));
    } catch {
      setCustomerProducts([]);
    }
  }

  useEffect(() => {
    const totalQuantity = watchedItems.reduce((sum, item) => sum + Number(item.quantityKg || 0), 0);
    const vehicleType = getVehicleIdForQuantity(totalQuantity, vehicleTypes);

    if (!customerId || !destinationId || !incoterm || !paymentTerm || !Number.isFinite(creditDays) || !vehicleType || !watchedItems.some((item) => item.productId && Number(item.quantityKg) > 0)) {
      setPreviewResult(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const validItems = watchedItems.flatMap((item, index) => {
          if (!item.productId || Number(item.quantityKg) <= 0) return [];
          const override = overrides[index] ?? {};
          return [{ productId: item.productId, quantityKg: Number(item.quantityKg), targetProfitPct: Number(item.targetProfitPct ?? 0), warehouseDaysOverride: override.warehouseDays, transportCostOverrideAed: override.transport, manualOtherCostAed: override.other }];
        });
        const preview = await previewQuotation({ customerId, deliveryType, destinationId, incoterm, paymentTerm, creditDays, vehicleType, freightAed: 0, items: validItems });
        setPreviewResult(preview);
      } catch (error) {
        setPreviewResult({ success: false, error: error instanceof Error ? error.message : "Unable to preview costing." });
      } finally {
        setPreviewLoading(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [customerId, deliveryType, destinationId, incoterm, paymentTerm, creditDays, watchedItems, vehicleTypes, overrides]);

  function updateOverride(index: number, key: keyof CostOverrides, value: string) {
    const numeric = value === "" ? undefined : Number(value);
    setOverrides((current) => ({ ...current, [index]: { ...current[index], [key]: numeric } }));
  }

  function clearItemOverride(index: number) {
    setOverrides((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  }

  async function onSubmit(values: QuotationFormValues) {
    setLoading(true);
    setResult(null);
    setSubmitError(null);
    try {
      if (loadingVehicles) throw new Error("Vehicle types are still loading. Please try again.");
      const totalQuantity = values.items.reduce((sum, item) => sum + item.quantityKg, 0);
      const vehicleType = getVehicleIdForQuantity(totalQuantity, vehicleTypes);
      if (!vehicleType) throw new Error("No suitable vehicle type is configured.");
      const calculation = await calculateQuotation({ ...values, vehicleType, freightAed: 0, items: values.items.map((item, index) => ({ ...item, warehouseDaysOverride: overrides[index]?.warehouseDays, transportCostOverrideAed: overrides[index]?.transport, manualOtherCostAed: overrides[index]?.other })) });
      setResult(calculation);
      if (!calculation.success) setSubmitError(calculation.error);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to calculate quotation.");
    } finally {
      setLoading(false);
    }
  }

  const liveItems: CostingItem[] = previewResult?.success && previewResult.role === "finance_admin" ? previewResult.items : [];
  const selectedIncoterm = incoterms.find((item) => item.id === incoterm);
  const isExWorks = Boolean(selectedIncoterm?.name?.toLowerCase().includes("ex works") || selectedIncoterm?.name?.toLowerCase().includes("ex-works"));
  const liveTotalCost = liveItems.reduce((sum, item) => sum + item.totalCost, 0);
  const liveTotalSales = liveItems.reduce((sum, item) => sum + item.salesPrice, 0);
  const liveTotalProfit = liveItems.reduce((sum, item) => sum + item.profitAmount, 0);
  const liveMargin = liveTotalSales === 0 ? 0 : (liveTotalProfit / liveTotalSales) * 100;

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-6"><h2 className="text-base font-semibold">Quotation Details</h2><p className="mt-1 text-sm text-zinc-500">Customer, delivery and payment information.</p></div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <div><label className="mb-2 block text-sm font-medium">Customer</label><SearchableSelect options={customers} value={customerId} onChange={handleCustomerChange} placeholder="Select customer" searchPlaceholder="Search customers..." /><FieldError message={errors.customerId?.message} /></div>
            <div><label className="mb-2 block text-sm font-medium">Delivery Type</label><select {...register("deliveryType")} className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none"><option value="local">Local</option><option value="export">Export</option></select></div>
            <div><label className="mb-2 block text-sm font-medium">Destination</label><Controller control={control} name="destinationId" render={({ field }) => <SearchableSelect options={destinations} value={field.value} onChange={field.onChange} placeholder="Select destination" searchPlaceholder="Search destinations..." />} /><FieldError message={errors.destinationId?.message} /></div>
            <div><label className="mb-2 block text-sm font-medium">Incoterm</label><Controller control={control} name="incoterm" render={({ field }) => <SearchableSelect options={incoterms} value={field.value} onChange={field.onChange} placeholder="Select incoterm" searchPlaceholder="Search incoterms..." />} /><FieldError message={errors.incoterm?.message} /></div>
            <div><label className="mb-2 block text-sm font-medium">Payment Term</label><Controller control={control} name="paymentTerm" render={({ field }) => <SearchableSelect options={paymentTerms} value={field.value} onChange={field.onChange} placeholder="Select payment term" searchPlaceholder="Search payment terms..." />} /><FieldError message={errors.paymentTerm?.message} /></div>
            <div><label className="mb-2 block text-sm font-medium">Credit Period</label><div className="relative"><input type="number" min="0" {...register("creditDays", { valueAsNumber: true })} className="w-full rounded-lg border bg-white px-3 py-2.5 pr-14 text-sm outline-none" /><span className="absolute right-3 top-2.5 text-sm text-zinc-400">days</span></div><FieldError message={errors.creditDays?.message} /></div>
          </div>
        </section>

        <section className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-6"><div><h2 className="text-base font-semibold">Line Items</h2><p className="mt-1 text-sm text-zinc-500">Set quantity and margin. Costing below updates automatically from current stock and rules.</p></div><button type="button" onClick={() => append({ productId: "", quantityKg: 0, targetProfitPct: 5 })} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-zinc-50"><Plus size={16} /> Add Product</button></div>
          <div className="overflow-visible">
            <table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-zinc-50"><tr><th className="px-6 py-3 text-left font-medium">#</th><th className="px-6 py-3 text-left font-medium">Product</th><th className="px-6 py-3 text-left font-medium">Quantity (kg)</th><th className="px-6 py-3 text-left font-medium">Margin %</th><th className="w-12 px-4 py-3" /></tr></thead><tbody className="divide-y">
              {fields.map((field, index) => {
                const selectedProductId = watchedItems[index]?.productId;
                const availableStock = selectedProductId ? productStock[selectedProductId] ?? 0 : null;
                const enteredQuantity = Number(watchedItems[index]?.quantityKg || 0);
                const projectedRemaining = availableStock === null ? null : availableStock - enteredQuantity;
                return <tr key={field.id}>
                  <td className="px-6 py-4 text-zinc-400">{index + 1}</td>
                  <td className="px-6 py-4"><Controller control={control} name={`items.${index}.productId`} render={({ field: productField }) => <SearchableSelect options={productOptions} value={productField.value} onChange={(value) => { productField.onChange(value); clearItemOverride(index); }} placeholder="Select product" searchPlaceholder="Search products..." />} /><FieldError message={errors.items?.[index]?.productId?.message} /></td>
                  <td className="px-6 py-4"><input type="number" min="0.01" step="0.01" {...register(`items.${index}.quantityKg`, { valueAsNumber: true })} className="w-full rounded-lg border px-3 py-2.5 outline-none" placeholder="0" />{selectedProductId && <div className="mt-1.5 space-y-0.5 text-xs"><p className="text-zinc-500">Available: <span className="font-medium text-zinc-700">{loadingStock ? "Checking…" : `${number(availableStock ?? 0)} kg`}</span></p>{!loadingStock && projectedRemaining !== null && enteredQuantity > 0 && <p className={projectedRemaining < 0 ? "font-medium text-red-600" : "text-emerald-700"}>{projectedRemaining < 0 ? `Insufficient stock: ${number(Math.abs(projectedRemaining))} kg short` : `Projected remaining: ${number(projectedRemaining)} kg`}</p>}</div>}<FieldError message={errors.items?.[index]?.quantityKg?.message} /></td>
                  <td className="px-6 py-4"><div className="relative max-w-[150px]"><input type="number" min="0" max="99.99" step="0.01" {...register(`items.${index}.targetProfitPct`, { valueAsNumber: true })} className="w-full rounded-lg border px-3 py-2.5 pr-8 outline-none" /><span className="absolute right-3 top-2.5 text-zinc-400">%</span></div></td>
                  <td className="px-4 py-4 text-right">{fields.length > 1 && <button type="button" onClick={() => { remove(index); clearItemOverride(index); }} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>}</td>
                </tr>;
              })}
            </tbody></table>
          </div>
        </section>

        {(previewResult?.success || previewResult?.success === false) && <section className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-6"><div><h2 className="text-base font-semibold">Live Costing</h2><p className="mt-1 text-sm text-zinc-500">Unit cost and selling price update as you change margin or any editable cost.</p></div>{previewLoading && <Loader2 size={18} className="animate-spin text-zinc-400" />}</div>
          {!previewResult.success ? <div className="flex items-start gap-3 p-5 text-sm text-amber-700"><AlertCircle size={18} className="mt-0.5" />{previewResult.error}</div> : previewResult.role !== "finance_admin" ? <div className="p-5 text-sm text-zinc-500">Live internal costing is available to Finance / Admin users.</div> : <div className="overflow-visible">
            <table className="w-full min-w-[1250px] text-sm"><thead className="border-b bg-zinc-50"><tr><th className="px-4 py-3 text-left">Product</th><th className="px-4 py-3 text-right">Purchase Unit Cost</th><th className="px-4 py-3 text-right">Warehouse Days</th><th className="px-4 py-3 text-right">Storage</th><th className="px-4 py-3 text-right">Transport</th><th className="px-4 py-3 text-right">Other Cost</th><th className="px-4 py-3 text-right">Unit Cost</th><th className="px-4 py-3 text-right">Margin</th><th className="px-4 py-3 text-right">Selling Unit Price</th></tr></thead><tbody className="divide-y">
              {liveItems.map((item) => { const index = watchedItems.findIndex((candidate) => candidate.productId === item.productId); const override = overrides[index] ?? {}; const warehouseDays = override.warehouseDays ?? item.warehouseDays; const transport = isExWorks ? 0 : (override.transport ?? item.sellingTransport); const other = override.other ?? item.manualOtherCostAed; return <tr key={item.productId}><td className="px-4 py-4 font-medium"><SuccessItem item={item} /></td><td className="px-4 py-4 text-right">{money(item.purchaseUnitCost)}</td><td className="px-4 py-4 text-right"><input type="number" min="0" step="1" value={warehouseDays} onChange={(event) => updateOverride(index, "warehouseDays", event.target.value)} className="w-28 rounded-lg border px-2.5 py-2 text-right" /></td><td className="px-4 py-4 text-right">{money(item.storageCharge)}</td><td className="px-4 py-4 text-right"><input type="number" min="0" step="0.01" disabled={isExWorks} value={transport} onChange={(event) => updateOverride(index, "transport", event.target.value)} className="w-32 rounded-lg border px-2.5 py-2 text-right disabled:bg-zinc-100 disabled:text-zinc-400" /></td><td className="px-4 py-4 text-right"><input type="number" min="0" step="0.01" value={other} onChange={(event) => updateOverride(index, "other", event.target.value)} className="w-28 rounded-lg border px-2.5 py-2 text-right" /></td><td className="px-4 py-4 text-right font-semibold">{money(item.costPerUnit)}</td><td className="px-4 py-4 text-right">{number(item.finalMarginPct)}%</td><td className="px-4 py-4 text-right text-base font-semibold">{money(item.salesUnitPrice)}</td></tr>; })}
            </tbody></table>
          </div>}
          {previewResult.success && previewResult.role === "finance_admin" && <div className="grid gap-px border-t bg-zinc-200 sm:grid-cols-4"><div className="bg-white p-5"><p className="text-xs uppercase tracking-wide text-zinc-400">Total Cost</p><p className="mt-1 text-lg font-semibold">{money(liveTotalCost)}</p></div><div className="bg-white p-5"><p className="text-xs uppercase tracking-wide text-zinc-400">Total Sales</p><p className="mt-1 text-lg font-semibold">{money(liveTotalSales)}</p></div><div className="bg-white p-5"><p className="text-xs uppercase tracking-wide text-zinc-400">Total Profit</p><p className="mt-1 text-lg font-semibold text-emerald-600">{money(liveTotalProfit)}</p></div><div className="bg-white p-5"><p className="text-xs uppercase tracking-wide text-zinc-400">Margin</p><p className="mt-1 text-lg font-semibold">{number(liveMargin)}%</p></div></div>}
        </section>}

        {submitError && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={18} />{submitError}</div>}
        <div className="flex justify-end"><button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">{loading ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}{loading ? "Saving..." : "Calculate & Save Quotation"}</button></div>
      </form>

      {result?.success && <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b p-6"><div className="flex items-center gap-3"><div className="rounded-full bg-emerald-50 p-2 text-emerald-600"><CheckCircle2 size={20} /></div><div><h2 className="text-base font-semibold">Quotation Saved</h2><p className="text-sm text-zinc-500">{result.quoteNumber}</p></div></div><p className="text-2xl font-semibold">{money(result.totalSales)}</p></div>
        <div className="overflow-visible"><table className="w-full min-w-[720px] text-sm"><thead className="border-b bg-zinc-50"><tr><th className="px-6 py-3 text-left">Product</th><th className="px-6 py-3 text-right">Qty</th><th className="px-6 py-3 text-right">Unit Selling Price</th><th className="px-6 py-3 text-right">Total</th></tr></thead><tbody className="divide-y">{result.items.map((item) => <tr key={item.productId}><td className="px-6 py-4 font-medium">{"productName" in item ? item.productName : "Product"}</td><td className="px-6 py-4 text-right">{number(item.quantityKg)} kg</td><td className="px-6 py-4 text-right">{money(item.salesUnitPrice)}</td><td className="px-6 py-4 text-right font-medium">{money(item.salesPrice)}</td></tr>)}</tbody></table></div>
        <div className="flex justify-end border-t bg-zinc-50 px-6 py-4"><button type="button" onClick={() => setResult(null)} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50">Continue</button></div>
      </section>}
    </div>
  );
}
