import { requireUser } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { QuotationForm } from "@/components/quotation/quotation-form";

export default async function NewQuotationPage() {
  await requireUser();

  const supabase = await createClient();

  const [
    customersResult,
    destinationsResult,
    incotermsResult,
    paymentTermsResult,
    productsResult,
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name")
      .eq("active", true)
      .order("name"),

    supabase
      .from("destinations")
      .select("id, name")
      .eq("active", true)
      .order("name"),

    supabase
      .from("incoterms")
      .select("id, name")
      .eq("active", true)
      .order("name"),

    supabase
      .from("payment_terms")
      .select("id, name")
      .eq("active", true)
      .order("name"),

    supabase
      .from("products")
      .select("id, name")
      .eq("active", true)
      .order("name"),
  ]);

  if (customersResult.error) {
    throw new Error(customersResult.error.message);
  }

  if (destinationsResult.error) {
    throw new Error(destinationsResult.error.message);
  }

  if (incotermsResult.error) {
    throw new Error(incotermsResult.error.message);
  }

  if (paymentTermsResult.error) {
    throw new Error(paymentTermsResult.error.message);
  }

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">
          New Quotation
        </h1>

        <p className="mt-1 text-sm text-zinc-500">
          Calculate landed cost and selling price.
        </p>
      </div>

      <QuotationForm
        customers={customersResult.data ?? []}
        destinations={destinationsResult.data ?? []}
        incoterms={incotermsResult.data ?? []}
        paymentTerms={paymentTermsResult.data ?? []}
        products={productsResult.data ?? []}
      />
    </div>
  );
}