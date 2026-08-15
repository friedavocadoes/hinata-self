import Link from "next/link";

export default function QuotationsPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Quotations
          </h1>

          <p className="mt-1 text-sm text-zinc-500">
            Create and manage customer quotations.
          </p>
        </div>

        <Link
          href="/quotations/new"
          className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          New Quotation
        </Link>
      </div>

      <div className="mt-8 rounded-xl border bg-white p-8 text-center">
        <p className="text-sm text-zinc-500">
          No quotations yet.
        </p>
      </div>
    </div>
  );
}