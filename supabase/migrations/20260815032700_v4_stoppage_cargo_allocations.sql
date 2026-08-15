-- KârKalkan v4: stoppage truth + auditable order-to-product cargo allocation.

alter table public.marketplace_daily_financials
  add column if not exists stoppage_net numeric not null default 0;

create table if not exists public.marketplace_order_product_map (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null,
  order_number text not null,
  order_day date,
  external_product_id text not null,
  sku text,
  product_name text,
  quantity integer not null default 0 check (quantity >= 0),
  line_net_amount numeric not null default 0 check (line_net_amount >= 0),
  source text not null default 'order_v2',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_order_product_map_connection_owner_fkey
    foreign key (connection_id,user_id)
    references public.marketplace_connections(id,user_id) on delete cascade,
  constraint marketplace_order_product_map_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint marketplace_order_product_map_unique
    unique (connection_id,order_number,external_product_id)
);

create index if not exists marketplace_order_product_map_connection_order_idx
  on public.marketplace_order_product_map(connection_id,order_number);
create index if not exists marketplace_order_product_map_user_idx
  on public.marketplace_order_product_map(user_id);
create index if not exists marketplace_order_product_map_day_idx
  on public.marketplace_order_product_map(connection_id,order_day);

alter table public.marketplace_order_product_map enable row level security;
drop policy if exists marketplace_order_product_map_select_own on public.marketplace_order_product_map;
create policy marketplace_order_product_map_select_own
  on public.marketplace_order_product_map
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.marketplace_order_product_map from anon;
grant select on public.marketplace_order_product_map to authenticated;

create table if not exists public.marketplace_product_cargo_allocations (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null,
  invoice_day date not null,
  invoice_serial_number text not null,
  parcel_unique_id text not null,
  order_number text not null,
  shipment_package_type text not null,
  external_product_id text not null,
  allocated_amount numeric not null default 0 check (allocated_amount >= 0),
  allocation_basis text not null default 'line_net_amount'
    check (allocation_basis in ('line_net_amount')),
  weight_line_net_amount numeric not null default 0 check (weight_line_net_amount >= 0),
  weight_quantity integer not null default 0 check (weight_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_product_cargo_allocations_connection_owner_fkey
    foreign key (connection_id,user_id)
    references public.marketplace_connections(id,user_id) on delete cascade,
  constraint marketplace_product_cargo_allocations_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint marketplace_product_cargo_allocations_unique
    unique (connection_id,invoice_serial_number,parcel_unique_id,shipment_package_type,external_product_id)
);

create index if not exists marketplace_product_cargo_allocations_connection_day_idx
  on public.marketplace_product_cargo_allocations(connection_id,invoice_day);
create index if not exists marketplace_product_cargo_allocations_connection_product_idx
  on public.marketplace_product_cargo_allocations(connection_id,external_product_id,invoice_day);
create index if not exists marketplace_product_cargo_allocations_user_idx
  on public.marketplace_product_cargo_allocations(user_id);

alter table public.marketplace_product_cargo_allocations enable row level security;
drop policy if exists marketplace_product_cargo_allocations_select_own on public.marketplace_product_cargo_allocations;
create policy marketplace_product_cargo_allocations_select_own
  on public.marketplace_product_cargo_allocations
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.marketplace_product_cargo_allocations from anon;
grant select on public.marketplace_product_cargo_allocations to authenticated;
