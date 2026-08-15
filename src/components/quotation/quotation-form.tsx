"use client";
import { calculateQuotation } from "@/app/(dashboard)/quotations/new/actions";
import { useState } from "react";
import { Controller, useForm, useFieldArray } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getCustomerProducts } from "@/app/(dashboard)/quotations/new/actions";

const quotationSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  deliveryType: z.enum(["local", "export"]),
  destinationId: z.string().min(1, "Destination is required"),
  incoterm: z.string().min(1, "Incoterm is required"),
  paymentTerm: z.string().min(1, "Payment term is required"),
  creditDays: z.coerce.number().min(0),

  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantityKg: z.coerce.number().positive(),
        targetProfitPct: z.coerce.number().min(0).max(100),
      }),
    )
    .min(1),
});

type QuotationFormValues = z.infer<typeof quotationSchema>;

interface Option {
  id: string;
  name: string;
}

interface QuotationFormProps {
  customers: Option[];
  destinations: Option[];
  incoterms: Option[];
  paymentTerms: Option[];
  products: Option[];
}

export function QuotationForm({
  customers,
  destinations,
  incoterms,
  paymentTerms,
  products,
}: QuotationFormProps) {
  const [loading, setLoading] = useState(false);

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

  const [customerProducts, setCustomerProducts] = useState<
    Awaited<ReturnType<typeof getCustomerProducts>>
  >([]);

  const customerProductOptions = customerProducts
    .filter(
      (item) => item.product_id && item.product_match_status === "matched",
    )
    .map((item) => ({
      id: item.product_id!,
      name: item.product_name_original,
    }));

  const uniqueCustomerProducts = Array.from(
    new Map(customerProductOptions.map((item) => [item.id, item])).values(),
  );

  const customerProductIds = new Set(
    uniqueCustomerProducts.map((product) => product.id),
  );

  const productOptions = [
    ...uniqueCustomerProducts,
    ...products.filter((product) => !customerProductIds.has(product.id)),
  ];

  async function onSubmit(values: QuotationFormValues) {
    setLoading(true);

    try {
      const result = await calculateQuotation(values);

      if (!result.success) {
        alert(result.error);
        return;
      }

      console.log("CALCULATION RESULT:", result);

      // Temporary.
      // We'll replace this with a proper result panel.
      alert(`Total Quote: AED ${result.totalSales.toFixed(2)}`);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Failed to calculate quotation.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCustomerChange(customerId: string) {
    setValue("customerId", customerId, {
      shouldValidate: true,
      shouldDirty: true,
    });

    setValue("items", [
      {
        productId: "",
        quantityKg: 0,
        targetProfitPct: 5,
      },
    ]);

    if (!customerId) {
      setCustomerProducts([]);
      return;
    }

    try {
      const data = await getCustomerProducts(customerId);

      setCustomerProducts(data);
    } catch (error) {
      console.error(error);
      setCustomerProducts([]);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* HEADER */}

      <section className="rounded-xl border bg-white p-6">
        <div className="mb-6">
          <h2 className="text-base font-semibold">Quotation Details</h2>

          <p className="mt-1 text-sm text-zinc-500">
            Customer and delivery information.
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

            {errors.customerId && (
              <p className="mt-1 text-xs text-red-500">
                {errors.customerId.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Delivery Type
            </label>

            <select
              {...register("deliveryType")}
              className="w-full rounded-lg border bg-white px-3 py-2.5 text-sm"
            >
              <option value="local">Local</option>
              <option value="export">Export</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Destination
            </label>

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
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Payment Term
            </label>

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
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Credit Period
            </label>

            <div className="relative">
              <input
                type="number"
                min="0"
                {...register("creditDays", {
                  valueAsNumber: true,
                })}
                className="w-full rounded-lg border bg-white px-3 py-2.5 pr-14 text-sm"
              />

              <span className="absolute right-3 top-2.5 text-sm text-zinc-400">
                days
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ITEMS */}

      <section className="rounded-xl border bg-white">
        <div className="flex items-center justify-between border-b p-6">
          <div>
            <h2 className="text-base font-semibold">Line Items</h2>

            <p className="mt-1 text-sm text-zinc-500">
              Add products to this quotation.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              append({
                productId: "",
                quantityKg: 0,
                targetProfitPct: 5,
              })
            }
            className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            + Add Product
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium">#</th>

                <th className="px-6 py-3 text-left font-medium">Product</th>

                <th className="px-6 py-3 text-left font-medium">
                  Quantity (KG)
                </th>

                <th className="px-6 py-3 text-left font-medium">
                  Target Margin
                </th>

                <th className="px-6 py-3" />
              </tr>
            </thead>

            <tbody className="divide-y">
              {fields.map((field, index) => (
                <tr key={field.id}>
                  <td className="px-6 py-4 text-zinc-400">{index + 1}</td>

                  <td className="px-6 py-4">
                    <SearchableSelect
                      options={productOptions}
                      value={watch(`items.${index}.productId`)}
                      onChange={(value) => {
                        setValue(`items.${index}.productId`, value, {
                          shouldValidate: true,
                          shouldDirty: true,
                        });
                      }}
                      placeholder="Select product"
                      searchPlaceholder="Search products..."
                    />
                  </td>

                  <td className="px-6 py-4">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      {...register(`items.${index}.quantityKg`, {
                        valueAsNumber: true,
                      })}
                      className="w-32 rounded-lg border px-3 py-2"
                    />
                  </td>

                  <td className="px-6 py-4">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        {...register(`items.${index}.targetProfitPct`, {
                          valueAsNumber: true,
                        })}
                        className="w-28 rounded-lg border px-3 py-2 pr-8"
                      />

                      <span className="absolute right-3 top-2 text-zinc-400">
                        %
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right">
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ACTION */}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Calculating..." : "Calculate Quotation"}
        </button>
      </div>
    </form>
  );
}
