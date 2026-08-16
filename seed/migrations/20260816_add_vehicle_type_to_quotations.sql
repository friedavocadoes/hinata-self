alter table public.quotations
  add column if not exists vehicle_type_id uuid references public.vehicle_types(id) on delete set null;

create index if not exists idx_quotations_created_at
  on public.quotations(created_at desc);

create index if not exists idx_quotations_customer
  on public.quotations(customer_id);

create index if not exists idx_quotation_items_quotation
  on public.quotation_items(quotation_id);
