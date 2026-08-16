import { requireUser } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { QuotationForm } from "@/components/quotation/quotation-form";

export default async function NewQuotationPage() {
  await requireUser();
  const supabase = await createClient();
  const [customersResult, destinationsResult, incotermsResult, paymentTermsResult, productsResult] = await Promise.all([
    supabase.from("customers").select("id, name").eq("active", true).order("name"),
    supabase.from("destinations").select("id, name").eq("active", true).order("name"),
    supabase.from("incoterms").select("id, name").eq("active", true).order("name"),
    supabase.from("payment_terms").select("id, name").eq("active", true).order("name"),
    supabase.from("products").select("id, name").eq("active", true).order("name"),
  ]);
  for (const result of [customersResult, destinationsResult, incotermsResult, paymentTermsResult, productsResult]) if (result.error) throw new Error(result.error.message);

  return <div className="p-8"><div className="mb-8"><h1 className="text-2xl font-semibold">New Costing</h1><p className="mt-1 text-sm text-zinc-500">Calculate the actual landed unit cost from received purchase stock, warehouse age and configured selling terms.</p></div><QuotationForm customers={customersResult.data ?? []} destinations={destinationsResult.data ?? []} incoterms={incotermsResult.data ?? []} paymentTerms={paymentTermsResult.data ?? []} products={productsResult.data ?? []} /></div>;
}
