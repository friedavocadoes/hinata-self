"use client";

import {
  calculateQuotation,
  getCustomerProducts,
} from "@/app/(dashboard)/quotations/new/actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useMemo, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

const quotationSchema = z.object({
  customerId: z.string().uuid("Customer is required"),
  deliveryType: z.enum(["local", "export"]),
  destinationId: z.string().uuid("Destination is required"),
  incoterm: z.string().uuid("Incoterm is required"),
  paymentTerm: z.string().uuid("Payment term is required"),
  creditDays: z.number().finite().min(0, "Credit days cannot be negative"),
  items: z.array(
    z.object({
      productId: z.string().uuid("Product is required"),
      quantityKg: z.number().finite().positive("Quantity must be greater than zero"),
      targetProfitPct: z.number().finite().min(0).lt(100),
    }),
  ).min(1),
});

type QuotationFormValues = z.infer<typeof quotationSchema>;

type Option = {
  id: string;
  name: string;
};

type CalculationResult = Awaited<ReturnType<typeof calculateQuotation>>;

type Props = {
  customers: Option[];
  destinations: Option[];
  incoterms: Option[];
  paymentTerms: Option[];
  products: Option[];
};

function money(value: number) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat("en-AE", {
    maximumFractionDigits: 2,
  }).format(value);
}

function getVehicleIdForQuantity(
  quantityKg: number,
  vehicles: Option[],
) {
  const ordered = [...vehicles].sort((a, b) => {
    const capacity = (name: string) => {
      const match = name.match(/([0-9]+)\s*T/i);
      return match ? Number(match[1]) * 1000 : Number.MAX_SAFE_INTEGER;
    };
    return capacity(a.name) - capacity(b.name);
  });

  for (const vehicle of ordered) {
    const match = vehicle.name.match(/([0-9]+)\s*T/i);
    if (match && quantityKg <= Number(match[1]) * 1000) {
      return vehicle.id;
    }
  }

  return ordered.find((vehicle) => /trailer/i.test(vehicle.name))?.id ?? ordered.at(-1)?.id ?? "";
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-500">{message}</p>;
}

export function QuotationForm({
  customers,
  destinations,
  incoterms,
  paymentTerms,
  products,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [customerProducts, setCustomerProducts] = useState<
    Awaited<ReturnType<typeof getCustomerProducts>>
  >([]);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<QuotationFormValues>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      deliveryType: "local",
      creditDays: 0,
      items: [
        {
          productId: "",
          quantityKg: 0,
          targetProfitPct: 5,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const watchedItems = watch("items");

  const customerProductOptions = useMemo(() => {
    const matched = customerProducts
      .filter((item) => item.product_id && item.product_match_status === "matched")
      .map((item) => ({
        id: item.product_id as string,
        name: item.product_name_original,
      }));

    const unique = Array.from(
      new Map(matched.map((item) => [item.id, item])).values(),
    );

    const ids = new Set(unique.map((item) => item.id));

    return [
      ...unique,
      ...products.filter((product) => !ids.has(product.id)),
    ];
  }, [customerProducts, products]);

  async function handleCustomerChange(customerId: string) {
    setValue("customerId", customerId, {
      shouldValidate: true,
      shouldDirty: true,
    });

    setValue("items", [
      { productId: "", quantityKg: 0, targetProfitPct: 5 },
    ]);
    setResult(null);
    setSubmitError(null);

    if (!customerId) {
      setCustomerProducts([]);
      return;
    }

    try {
      setCustomerProducts(await getCustomerProducts(customerId));
    } catch (error) {
      console.error(error);
      setCustomerProducts([]);
    }
  }

  async function onSubmit(values: QuotationFormValues) {
    setLoading(true);
    setResult(null);
    setSubmitError(null);

    try {
      const totalQuantity = values.items.reduce(
        (sum, item) => sum + item.quantityKg,
        0,
      );

      // Vehicle is selected automatically from shipment quantity.
      // These are the capacities defined by the transport matrix.
      const vehicleTypes: Option[] = [
        { id: "__1T__", name: "1 Ton" },
        { id: "__3T__", name: "3 Ton" },
        { id: "__7T__", name: "7 Ton" },
        { id: "__10T__", name: "10 Ton" },
        { id: "__TRAILER__", name: "Trailer 20\"" },
      ];

      // Resolve the actual UUIDs by loading the server-side vehicle list
      // through the calculation action's expected IDs. The form no longer
      // exposes vehicle selection to the user.
      const vehicleResponse = await fetch("/api/vehicle-types", {
        method: "GET",
        cache: "no-store",
      });

      if (!vehicleResponse.ok) {
        throw new Error("Unable to load vehicle types.");
      }

      const actualVehicles: Option[] = await vehicleResponse.json();
      const vehicleType = getVehicleIdForQuantity(totalQuantity, actualVehicles);

      if (!vehicleType) {
        throw new Error("No vehicle type is configured.");
      }

      const calculation = await calculateQuotation({
        ...values,
        vehicleType,
      });

      setResult(calculation);

      if (!calculation.success) {
        setSubmitError(calculation.error);
      }
    } catch (error) {
      console.error("Quotation calculation failed:", error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to calculate quotation.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-base font-semibold">Quotation Details</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Customer, delivery and payment information.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium">Customer</label>
              <SearchableSelect
                options={customers}
                value={watch("customerId")}
                onChange={handleCustomerChange}
                placeholder="Select customer"
                searchPlaceholder="Search customers..."
              />
              <FieldError message={errors.customerId?.message} />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Delivery Type</label>
              <select
                {...register("deliveryType")}
                className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
              >
                <option value="local">Local</option>
                <option value="export">Export</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Destination</label>
              <Controller
                control={control}
                name="destinationId"
                render={({ field }) => (
                  <SearchableSelect
                    options={destinations}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select destination"
                    searchPlaceholder="Search destinations..."
                  />
                )}
              />
              <FieldError message={errors.destinationId?.message} />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Incoterm</label>
              <Controller
                control={control}
                name="incoterm"
                render={({ field }) => (
                  <SearchableSelect
                    options={incoterms}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select incoterm"
                    searchPlaceholder="Search incoterms..."
                  />
                )}
              />
              <FieldError message={errors.incoterm?.message} />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Payment Term</label>
              <Controller
                control={control}
                name="paymentTerm"
                render={({ field }) => (
                  <SearchableSelect
                    options={paymentTerms}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Select payment term"
                    searchPlaceholder="Search payment terms..."
                  />
                )}
              />
              <FieldError message={errors.paymentTerm?.message} />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Credit Period</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  {...register("creditDays", { valueAsNumber: true })}
                  className="w-full rounded-lg border bg-white px-3 py-2.5 pr-14 text-sm outline-none focus:border-zinc-400"
                />
                <span className="absolute right-3 top-2.5 text-sm text-zinc-400">days</span>
              </div>
              <FieldError message={errors.creditDays?.message} />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-6">
            <div>
              <h2 className="text-base font-semibold">Line Items</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Customer products are shown first. Transport is selected automatically from total quantity.
              </p>
            </div>
            <button
              type="button"
              onClick={() => append({ productId: "", quantityKg: 0, targetProfitPct: 5 })}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              <Plus size={16} />
              Add Product
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-zinc-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">#</th>
                  <th className="px-6 py-3 text-left font-medium">Product</th>
                  <th className="px-6 py-3 text-left font-medium">Quantity (kg)</th>
                  <th className="px-6 py-3 text-left font-medium">Target Margin</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {fields.map((field, index) => (
                  <tr key={field.id}>
                    <td className="px-6 py-4 text-zinc-400">{index + 1}</td>
                    <td className="px-6 py-4">
                      <Controller
                        control={control}
                        name={`items.${index}.productId`}
                        render={({ field: productField }) => (
                          <SearchableSelect
                            options={customerProductOptions}
                            value={productField.value}
                            onChange={productField.onChange}
                            placeholder="Select product"
                            searchPlaceholder="Search products..."
                          />
                        )}
                      />
                      <FieldError message={errors.items?.[index]?.productId?.message} />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        {...register(`items.${index}.quantityKg`, { valueAsNumber: true })}
                        className="w-full rounded-lg border px-3 py-2.5 outline-none focus:border-zinc-400"
                        placeholder="0"
                      />
                      <FieldError message={errors.items?.[index]?.quantityKg?.message} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative max-w-[150px]">
                        <input
                          type="number"
                          min="0"
                          max="99.99"
                          step="0.01"
                          {...register(`items.${index}.targetProfitPct`, { valueAsNumber: true })}
                          className="w-full rounded-lg border px-3 py-2.5 pr-8 outline-none focus:border-zinc-400"
                        />
                        <span className="absolute right-3 top-2.5 text-zinc-400">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Remove product"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {submitError && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 shrink-0" size={18} />
            <div>{submitError}</div>
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
            {loading ? "Calculating..." : "Calculate Quotation"}
          </button>
        </div>
      </form>

      {result?.success && (
        <section className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-50 p-2 text-emerald-600">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h2 className="text-base font-semibold">Quotation Result</h2>
                <p className="text-sm text-zinc-500">
                  {result.role === "finance_admin"
                    ? "Internal costing breakdown"
                    : "Customer-facing selling prices"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Total Quote</p>
              <p className="text-2xl font-semibold tracking-tight">{money(result.totalSales)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-zinc-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Product</th>
                  <th className="px-6 py-3 text-right font-medium">Qty</th>
                  <th className="px-6 py-3 text-right font-medium">Unit Selling Price</th>
                  <th className="px-6 py-3 text-right font-medium">Total</th>
                  {result.role === "finance_admin" && (
                    <th className="px-6 py-3 text-right font-medium">Margin</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.items.map((item) => (
                  <tr key={item.productId}>
                    <td className="px-6 py-4 font-medium">
                      {"productName" in item ? item.productName : "Product"}
                    </td>
                    <td className="px-6 py-4 text-right">{number(item.quantityKg)} kg</td>
                    <td className="px-6 py-4 text-right">{money(item.salesUnitPrice)}</td>
                    <td className="px-6 py-4 text-right font-medium">{money(item.salesPrice)}</td>
                    {result.role === "finance_admin" && (
                      <td className="px-6 py-4 text-right">{number(item.finalMarginPct)}%</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.role === "finance_admin" && (
            <div className="grid gap-px border-t bg-zinc-200 sm:grid-cols-3">
              <div className="bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Total Cost</p>
                <p className="mt-1 text-lg font-semibold">{money(result.totalCost)}</p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Total Sales</p>
                <p className="mt-1 text-lg font-semibold">{money(result.totalSales)}</p>
              </div>
              <div className="bg-white p-5">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Total Profit</p>
                <p className="mt-1 text-lg font-semibold text-emerald-600">{money(result.totalProfit)}</p>
              </div>
            </div>
          )}

          {result.role === "finance_admin" && (
            <details className="border-t">
              <summary className="cursor-pointer px-6 py-4 text-sm font-medium hover:bg-zinc-50">
                View internal costing breakdown
              </summary>
              <div className="overflow-x-auto border-t">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-4 py-3 text-left">Product</th>
                      <th className="px-4 py-3 text-right">Ex-Works</th>
                      <th className="px-4 py-3 text-right">Inward Clearance</th>
                      <th className="px-4 py-3 text-right">Bank</th>
                      <th className="px-4 py-3 text-right">Storage</th>
                      <th className="px-4 py-3 text-right">Transport</th>
                      <th className="px-4 py-3 text-right">Customs</th>
                      <th className="px-4 py-3 text-right">Insurance</th>
                      <th className="px-4 py-3 text-right">Finance</th>
                      <th className="px-4 py-3 text-right">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.items.map((item) => (
                      <tr key={`breakdown-${item.productId}`}>
                        <td className="px-4 py-3 font-medium">{item.productName}</td>
                        <td className="px-4 py-3 text-right">{money(item.exWorksCost)}</td>
                        <td className="px-4 py-3 text-right">{money(item.inwardClearance)}</td>
                        <td className="px-4 py-3 text-right">{money(item.inwardBankCharge)}</td>
                        <td className="px-4 py-3 text-right">{money(item.storageCharge)}</td>
                        <td className="px-4 py-3 text-right">{money(item.outwardTransport)}</td>
                        <td className="px-4 py-3 text-right">{money(item.customsDuty)}</td>
                        <td className="px-4 py-3 text-right">{money(item.insurance)}</td>
                        <td className="px-4 py-3 text-right">{money(item.bankFinanceCharge + item.capitalInterest)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{money(item.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div className="flex items-center justify-between border-t bg-zinc-50 px-6 py-4">
            <div className="text-sm text-zinc-500">
              {watchedItems.length} line item{watchedItems.length === 1 ? "" : "s"}
            </div>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              Recalculate
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
