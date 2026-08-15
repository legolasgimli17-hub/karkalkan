-- KârKalkan v4: auditable Trendyol cargo invoice details.

create table if not exists public.marketplace_cargo_invoice_items (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_serial_number text not null,
  invoice_day date not null,
  parcel_unique_id text not null,
  order_number text,
  shipment_package_type text not null,
  amount numeric not null default 0,
  desi integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_cargo_invoice_items_connection_owner_fkey
    foreign key (connection_id,user_id)
    references public.marketplace_connections(id,user_id)
    on delete cascade,
  constraint marketplace_cargo_invoice_items_unique
    unique (connection_id,invoice_serial_number,parcel_unique_id,shipment_package_type)
);

alter table public.marketplace_cargo_invoice_items enable row level security;

drop policy if exists "cargo_items_select_own" on public.marketplace_cargo_invoice_items;
create policy "cargo_items_select_own" on public.marketplace_cargo_invoice_items
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "cargo_items_insert_own" on public.marketplace_cargo_invoice_items;
create policy "cargo_items_insert_own" on public.marketplace_cargo_invoice_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "cargo_items_update_own" on public.marketplace_cargo_invoice_items;
create policy "cargo_items_update_own" on public.marketplace_cargo_invoice_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "cargo_items_delete_own" on public.marketplace_cargo_invoice_items;
create policy "cargo_items_delete_own" on public.marketplace_cargo_invoice_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists marketplace_cargo_invoice_items_connection_owner_idx
  on public.marketplace_cargo_invoice_items(connection_id,user_id);
create index if not exists marketplace_cargo_invoice_items_order_idx
  on public.marketplace_cargo_invoice_items(connection_id,order_number);
create index if not exists marketplace_cargo_invoice_items_day_idx
  on public.marketplace_cargo_invoice_items(connection_id,invoice_day);

alter table public.marketplace_daily_financials
  drop constraint if exists marketplace_daily_financials_other_financial_coverage_check;

alter table public.marketplace_daily_financials
  add constraint marketplace_daily_financials_other_financial_coverage_check
  check (other_financial_coverage in (
    'none',
    'platform_service_fee',
    'cargo',
    'platform_service_fee_and_cargo'
  ));

comment on table public.marketplace_cargo_invoice_items is
  'Auditable Trendyol cargo invoice detail lines. Contains order/package finance metadata only; no customer PII.';
