-- Landed Costing & Margin Quotation System
-- Supabase PostgreSQL schema
-- Run this in Supabase SQL Editor on a fresh project.

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('sales_rep', 'finance_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.delivery_type as enum ('local', 'export');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quotation_status as enum ('draft', 'pending_approval', 'sent', 'won', 'lost', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('draft', 'confirmed', 'partially_fulfilled', 'fulfilled', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.purchase_status as enum ('draft', 'ordered', 'received', 'partially_received', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inventory_movement_type as enum (
    'purchase', 'sale', 'return_in', 'return_out',
    'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out'
  );
exception when duplicate_object then null; end $$;

-- =========================
-- AUTH / USERS
-- =========================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'sales_rep',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Automatically create a profile for newly-created Supabase Auth users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper used by RLS policies. SECURITY DEFINER avoids recursive profile policies.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_finance_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'finance_admin', false)
$$;

-- =========================
-- MASTER DATA
-- =========================

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  email text,
  phone text,
  region text, -- local / gcc / africa / other
  address text,
  tax_registration_no text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.destinations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null unique,
  region text,
  delivery_type public.delivery_type,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.incoterms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  delivery_type public.delivery_type,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  customer_side boolean not null default true,
  supplier_side boolean not null default true,
  default_credit_days integer not null default 0 check (default_credit_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  capacity_kg numeric,
  active boolean not null default true
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  excel_reference_no integer,
  name text not null,
  supply_type text not null,
  pack_size_kg numeric not null check (pack_size_kg > 0),
  cif_rate_usd numeric(18,6) not null check (cif_rate_usd >= 0),
  default_profit_pct numeric(8,4) not null default 5.0,
  inward_clearance_charge numeric(18,4) not null default 0,
  storage_rate numeric(18,6),
  storage_days integer not null default 0 check (storage_days >= 0),
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_mop text,
  supplier_credit_days integer not null default 0 check (supplier_credit_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_name on public.products using gin (to_tsvector('simple', name));
create index if not exists idx_products_supplier on public.products(supplier_id);

create table if not exists public.transport_rates (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.destinations(id) on delete cascade,
  vehicle_type_id uuid not null references public.vehicle_types(id) on delete cascade,
  rate_aed numeric(18,4) not null check (rate_aed >= 0),
  effective_from date,
  effective_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(destination_id, vehicle_type_id, effective_from)
);

create table if not exists public.transport_surcharges (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid references public.destinations(id) on delete cascade,
  name text not null,
  condition_type text not null, -- e.g. vehicle_capacity_lte / vehicle_capacity_gt
  threshold_kg numeric,
  surcharge_aed numeric(18,4) not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.global_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value numeric(24,10) not null,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_fee_rules (
  id uuid primary key default gen_random_uuid(),
  side text not null check (side in ('supplier', 'customer')),
  payment_term_code text not null,
  credit_days integer,
  flat_fee_aed numeric(18,4) not null default 0,
  value_pct numeric(12,8) not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.insurance_rules (
  id uuid primary key default gen_random_uuid(),
  incoterm_code text not null,
  base_rate_pct numeric(12,8) not null,
  insured_value_multiplier numeric(12,6) not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.customs_charge_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  charge_type text not null, -- flat / percentage
  amount numeric(18,6) not null default 0,
  base_type text, -- sales_value / invoice_value / per_document / actual
  delivery_type public.delivery_type,
  incoterm_code text,
  destination_id uuid references public.destinations(id) on delete cascade,
  product_condition text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- =========================
-- SALES / QUOTATIONS
-- =========================

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  created_by uuid not null references public.profiles(id),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name_snapshot text not null,
  quote_date date not null default current_date,
  delivery_type public.delivery_type not null,
  destination_id uuid references public.destinations(id) on delete set null,
  destination_name_snapshot text,
  incoterm_code text not null,
  pay_term_code text not null,
  credit_period_days integer not null default 0 check (credit_period_days >= 0),
  freight_total numeric(18,4) not null default 0,
  total_cost numeric(18,4) not null default 0,
  total_sales numeric(18,4) not null default 0,
  total_profit numeric(18,4) not null default 0,
  final_margin_pct numeric(8,4) not null default 0,
  status public.quotation_status not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  qty_kg numeric(18,4) not null check (qty_kg > 0),
  target_profit_pct numeric(8,4) not null,
  supplier_invoice_value numeric(18,4) not null default 0,
  ex_works_cost numeric(18,4) not null default 0,
  inward_clearance numeric(18,4) not null default 0,
  inward_bank_charge numeric(18,4) not null default 0,
  storage_charge numeric(18,4) not null default 0,
  outward_clearance numeric(18,4) not null default 0,
  outward_transport numeric(18,4) not null default 0,
  freight numeric(18,4) not null default 0,
  insurance numeric(18,4) not null default 0,
  other_expense numeric(18,4) not null default 0,
  bank_finance_charge numeric(18,4) not null default 0,
  capital_interest numeric(18,4) not null default 0,
  customs_duty numeric(18,4) not null default 0,
  total_cost numeric(18,4) not null default 0,
  cost_per_unit numeric(18,6) not null default 0,
  sales_unit_price numeric(18,6) not null default 0,
  sales_price numeric(18,4) not null default 0,
  profit_amount numeric(18,4) not null default 0,
  final_margin_pct numeric(8,4) not null default 0,
  created_at timestamptz not null default now()
);

-- =========================
-- ORDERS
-- =========================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  quotation_id uuid references public.quotations(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name_snapshot text not null,
  order_date date not null default current_date,
  status public.order_status not null default 'draft',
  delivery_type public.delivery_type,
  destination_id uuid references public.destinations(id) on delete set null,
  destination_name_snapshot text,
  incoterm_code text,
  pay_term_code text,
  credit_period_days integer not null default 0,
  total_sales numeric(18,4) not null default 0,
  total_cost numeric(18,4) not null default 0,
  total_profit numeric(18,4) not null default 0,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  qty_kg numeric(18,4) not null check (qty_kg > 0),
  unit_selling_price numeric(18,6) not null default 0,
  total_sales numeric(18,4) not null default 0,
  cost_per_unit numeric(18,6) not null default 0,
  total_cost numeric(18,4) not null default 0,
  profit_amount numeric(18,4) not null default 0,
  created_at timestamptz not null default now()
);

-- =========================
-- PURCHASING
-- =========================

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  purchase_number text not null unique,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name_snapshot text,
  purchase_date date not null default current_date,
  status public.purchase_status not null default 'draft',
  supplier_payment_term text,
  supplier_credit_days integer not null default 0,
  total_value_aed numeric(18,4) not null default 0,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  qty_kg numeric(18,4) not null check (qty_kg > 0),
  unit_purchase_price_aed numeric(18,6) not null default 0,
  total_purchase_value_aed numeric(18,4) not null default 0,
  received_qty_kg numeric(18,4) not null default 0,
  created_at timestamptz not null default now()
);

-- =========================
-- INVENTORY
-- =========================

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  movement_type public.inventory_movement_type not null,
  quantity_kg numeric(18,4) not null check (quantity_kg > 0),
  signed_quantity_kg numeric(18,4) generated always as (
    case
      when movement_type in ('purchase', 'return_in', 'adjustment_in', 'transfer_in') then quantity_kg
      else -quantity_kg
    end
  ) stored,
  unit_cost_aed numeric(18,6),
  reference_type text,
  reference_id uuid,
  movement_date timestamptz not null default now(),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_product on public.inventory_movements(product_id);
create index if not exists idx_inventory_warehouse on public.inventory_movements(warehouse_id);

create or replace view public.inventory_balances as
select
  p.id as product_id,
  p.name as product_name,
  coalesce(sum(im.signed_quantity_kg), 0) as quantity_kg
from public.products p
left join public.inventory_movements im on im.product_id = p.id
group by p.id, p.name;

create or replace view public.inventory_balances_by_warehouse as
select
  p.id as product_id,
  p.name as product_name,
  w.id as warehouse_id,
  w.name as warehouse_name,
  coalesce(sum(im.signed_quantity_kg), 0) as quantity_kg
from public.products p
cross join public.warehouses w
left join public.inventory_movements im
  on im.product_id = p.id
 and im.warehouse_id = w.id
group by p.id, p.name, w.id, w.name;

-- =========================
-- TASKS
-- =========================

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid references public.quotations(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  title text not null,
  status text not null default 'pending',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- UPDATED_AT TRIGGER
-- =========================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
for each row execute procedure public.set_updated_at();

drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers
for each row execute procedure public.set_updated_at();

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at before update on public.suppliers
for each row execute procedure public.set_updated_at();

drop trigger if exists quotations_updated_at on public.quotations;
create trigger quotations_updated_at before update on public.quotations
for each row execute procedure public.set_updated_at();

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
for each row execute procedure public.set_updated_at();

drop trigger if exists purchase_orders_updated_at on public.purchase_orders;
create trigger purchase_orders_updated_at before update on public.purchase_orders
for each row execute procedure public.set_updated_at();

-- =========================
-- RLS
-- =========================

alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.customers enable row level security;
alter table public.destinations enable row level security;
alter table public.incoterms enable row level security;
alter table public.payment_terms enable row level security;
alter table public.vehicle_types enable row level security;
alter table public.products enable row level security;
alter table public.transport_rates enable row level security;
alter table public.transport_surcharges enable row level security;
alter table public.global_settings enable row level security;
alter table public.bank_fee_rules enable row level security;
alter table public.insurance_rules enable row level security;
alter table public.customs_charge_rules enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_items enable row level security;
alter table public.warehouses enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.tasks enable row level security;

-- Profiles
drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_finance_admin());
drop policy if exists "admins can update profiles" on public.profiles;
create policy "admins can update profiles" on public.profiles for update to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());

-- Readable master data
create policy "authenticated read suppliers" on public.suppliers for select to authenticated using (true);
create policy "authenticated read customers" on public.customers for select to authenticated using (true);
create policy "authenticated read destinations" on public.destinations for select to authenticated using (true);
create policy "authenticated read incoterms" on public.incoterms for select to authenticated using (true);
create policy "authenticated read payment terms" on public.payment_terms for select to authenticated using (true);
create policy "authenticated read vehicle types" on public.vehicle_types for select to authenticated using (true);
create policy "authenticated read products" on public.products for select to authenticated using (true);
create policy "admins manage products" on public.products for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "authenticated read transport rates" on public.transport_rates for select to authenticated using (true);
create policy "authenticated read transport surcharges" on public.transport_surcharges for select to authenticated using (true);
create policy "authenticated read bank rules" on public.bank_fee_rules for select to authenticated using (public.is_finance_admin());
create policy "authenticated read insurance rules" on public.insurance_rules for select to authenticated using (public.is_finance_admin());
create policy "authenticated read customs rules" on public.customs_charge_rules for select to authenticated using (public.is_finance_admin());
create policy "authenticated read settings" on public.global_settings for select to authenticated using (public.is_finance_admin());

create policy "admins manage suppliers" on public.suppliers for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "authenticated create customers" on public.customers for insert to authenticated with check (true);
create policy "users manage own/customer data" on public.customers for update to authenticated using (true) with check (true);
create policy "admins delete customers" on public.customers for delete to authenticated using (public.is_finance_admin());
create policy "admins manage destinations" on public.destinations for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "admins manage incoterms" on public.incoterms for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "admins manage payment terms" on public.payment_terms for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "admins manage vehicle types" on public.vehicle_types for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "admins manage transport" on public.transport_rates for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "admins manage transport surcharges" on public.transport_surcharges for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "admins manage settings" on public.global_settings for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "admins manage bank rules" on public.bank_fee_rules for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "admins manage insurance rules" on public.insurance_rules for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "admins manage customs rules" on public.customs_charge_rules for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());

create policy "read quotations" on public.quotations for select to authenticated using (created_by = auth.uid() or public.is_finance_admin());
create policy "create quotations" on public.quotations for insert to authenticated with check (created_by = auth.uid());
create policy "update quotations" on public.quotations for update to authenticated using (created_by = auth.uid() or public.is_finance_admin()) with check (created_by = auth.uid() or public.is_finance_admin());
create policy "read quotation items" on public.quotation_items for select to authenticated using (exists (select 1 from public.quotations q where q.id = quotation_id and (q.created_by = auth.uid() or public.is_finance_admin())));
create policy "write quotation items" on public.quotation_items for all to authenticated using (exists (select 1 from public.quotations q where q.id = quotation_id and (q.created_by = auth.uid() or public.is_finance_admin()))) with check (exists (select 1 from public.quotations q where q.id = quotation_id and (q.created_by = auth.uid() or public.is_finance_admin())));

create policy "read orders" on public.orders for select to authenticated using (created_by = auth.uid() or public.is_finance_admin());
create policy "write orders" on public.orders for all to authenticated using (created_by = auth.uid() or public.is_finance_admin()) with check (created_by = auth.uid() or public.is_finance_admin());
create policy "read order items" on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.created_by = auth.uid() or public.is_finance_admin())));
create policy "write order items" on public.order_items for all to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (o.created_by = auth.uid() or public.is_finance_admin()))) with check (exists (select 1 from public.orders o where o.id = order_id and (o.created_by = auth.uid() or public.is_finance_admin())));
create policy "read purchases" on public.purchase_orders for select to authenticated using (created_by = auth.uid() or public.is_finance_admin());
create policy "write purchases" on public.purchase_orders for all to authenticated using (created_by = auth.uid() or public.is_finance_admin()) with check (created_by = auth.uid() or public.is_finance_admin());
create policy "read purchase items" on public.purchase_items for select to authenticated using (exists (select 1 from public.purchase_orders p where p.id = purchase_order_id and (p.created_by = auth.uid() or public.is_finance_admin())));
create policy "write purchase items" on public.purchase_items for all to authenticated using (exists (select 1 from public.purchase_orders p where p.id = purchase_order_id and (p.created_by = auth.uid() or public.is_finance_admin()))) with check (exists (select 1 from public.purchase_orders p where p.id = purchase_order_id and (p.created_by = auth.uid() or public.is_finance_admin())));
create policy "read warehouses" on public.warehouses for select to authenticated using (true);
create policy "admins manage warehouses" on public.warehouses for all to authenticated using (public.is_finance_admin()) with check (public.is_finance_admin());
create policy "read inventory movements" on public.inventory_movements for select to authenticated using (true);
create policy "write inventory movements" on public.inventory_movements for insert to authenticated with check (created_by = auth.uid() or public.is_finance_admin());
create policy "read tasks" on public.tasks for select to authenticated using (assigned_to = auth.uid() or public.is_finance_admin());
create policy "write tasks" on public.tasks for all to authenticated using (assigned_to = auth.uid() or public.is_finance_admin()) with check (assigned_to = auth.uid() or public.is_finance_admin());
