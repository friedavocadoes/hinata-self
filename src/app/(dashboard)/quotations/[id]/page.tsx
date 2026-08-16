import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

function money(value: number) {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
  }).format(value);
}

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireUser();
  const { id } = await params;
  const admin = createAdminClient();

  const quotationResult = await admin
    .from("quotations")
    .select(
      "id, quote_number, created_by, customer_name_snapshot, quote_date, delivery_type, destination_name_snapshot, incoterm_code, pay_term_code, credit_period_days, total_cost, total_sales, total_profit, final_margin_pct, status",
    )
    .eq("id", id)
    .maybeSingle();

  if (quotationResult.error) throw new Error(quotationResult.error.message);
  if (!quotationResult.data) notFound();

  const quotation = quotationResult.data;

  if (profile?.role !== "finance_admin" && quotation.created_by !== profile?.id) {
    notFound();
  }

  const itemsResult = await admin
    .from("quotation_items")
    .select(
      "id, product_name_snapshot, qty_kg, target_profit_pct, ex_works_cost, inward_clearance, inward_bank_charge, storage_charge, outward_clearance, outward_transport, freight, insurance, other_expense, bank_finance_charge, capital_interest, customs_duty, total_cost, cost_per_unit, sales_unit_price, sales_price, profit_amount, final_margin_pct",
    )
    .eq("quotation_id", id)
    .order("created_at");

  if (itemsResult.error) throw new Error(itemsResult.error.message);

  const items = itemsResult.data ?? [];

  return (
    <div className="p-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <Link href="/quotations" className="text-sm text-zinc-500 hover:text-zinc-900">
            ← Quotations
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{quotation.quote_number}</h1>
          <p className="mt-1 text-sm text-zinc-500">Quotation details and calculated pricing.</p>
        </div>

        <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium capitalize text-zinc-700">
          {quotation.status.replaceAll("_", " ")}
        </span>
      </div>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Customer</p>
            <p className="mt-1 font-medium">{quotation.customer_name_snapshot}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Destination</p>
            <p className="mt-1 font-medium">{quotation.destination_name_snapshot ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Incoterm</p>
            <p className="mt-1 font-medium">{quotation.incoterm_code}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-400">Payment</p>
            <p className="mt-1 font-medium">
              {quotation.pay_term_code} · {quotation.credit_period_days} days
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="border-b p-6">
          <h2 className="font-semibold">Items</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Product</th>
                <th className="px-5 py-3 text-right font-medium">Qty</th>
                <th className="px-5 py-3 text-right font-medium">Unit Price</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
                {profile?.role === "finance_admin" && (
                  <>
                    <th className="px-5 py-3 text-right font-medium">Cost / Unit</th>
                    <th className="px-5 py-3 text-right font-medium">Profit</th>
                    <th className="px-5 py-3 text-right font-medium">Margin</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4 font-medium">{item.product_name_snapshot}</td>
                  <td className="px-5 py-4 text-right">{Number(item.qty_kg).toLocaleString()} kg</td>
                  <td className="px-5 py-4 text-right">{money(Number(item.sales_unit_price))}</td>
                  <td className="px-5 py-4 text-right font-medium">{money(Number(item.sales_price))}</td>
                  {profile?.role === "finance_admin" && (
                    <>
                      <td className="px-5 py-4 text-right">{money(Number(item.cost_per_unit))}</td>
                      <td className="px-5 py-4 text-right">{money(Number(item.profit_amount))}</td>
                      <td className="px-5 py-4 text-right">{Number(item.final_margin_pct).toFixed(2)}%</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {profile?.role === "finance_admin" && (
        <section className="mt-6 rounded-xl border bg-white shadow-sm">
          <div className="grid gap-px bg-zinc-200 sm:grid-cols-3">
            <div className="bg-white p-6">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Total Cost</p>
              <p className="mt-1 text-xl font-semibold">{money(Number(quotation.total_cost))}</p>
            </div>
            <div className="bg-white p-6">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Total Sales</p>
              <p className="mt-1 text-xl font-semibold">{money(Number(quotation.total_sales))}</p>
            </div>
            <div className="bg-white p-6">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Total Profit</p>
              <p className="mt-1 text-xl font-semibold text-emerald-600">{money(Number(quotation.total_profit))}</p>
            </div>
          </div>

          <details className="border-t">
            <summary className="cursor-pointer px-6 py-4 text-sm font-medium hover:bg-zinc-50">
              View internal costing components
            </summary>
            <div className="overflow-x-auto border-t">
              <table className="w-full min-w-[1300px] text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-right">Ex-Works</th>
                    <th className="px-4 py-3 text-right">Inward</th>
                    <th className="px-4 py-3 text-right">Bank</th>
                    <th className="px-4 py-3 text-right">Storage</th>
                    <th className="px-4 py-3 text-right">Transport</th>
                    <th className="px-4 py-3 text-right">Freight</th>
                    <th className="px-4 py-3 text-right">Insurance</th>
                    <th className="px-4 py-3 text-right">Customs</th>
                    <th className="px-4 py-3 text-right">Finance</th>
                    <th className="px-4 py-3 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item) => (
                    <tr key={`cost-${item.id}`}>
                      <td className="px-4 py-3 font-medium">{item.product_name_snapshot}</td>
                      <td className="px-4 py-3 text-right">{money(Number(item.ex_works_cost))}</td>
                      <td className="px-4 py-3 text-right">{money(Number(item.inward_clearance))}</td>
                      <td className="px-4 py-3 text-right">{money(Number(item.inward_bank_charge))}</td>
                      <td className="px-4 py-3 text-right">{money(Number(item.storage_charge))}</td>
                      <td className="px-4 py-3 text-right">{money(Number(item.outward_transport))}</td>
                      <td className="px-4 py-3 text-right">{money(Number(item.freight))}</td>
                      <td className="px-4 py-3 text-right">{money(Number(item.insurance))}</td>
                      <td className="px-4 py-3 text-right">{money(Number(item.customs_duty))}</td>
                      <td className="px-4 py-3 text-right">{money(Number(item.bank_finance_charge) + Number(item.capital_interest))}</td>
                      <td className="px-4 py-3 text-right font-semibold">{money(Number(item.total_cost))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
