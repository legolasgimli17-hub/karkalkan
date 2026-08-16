create table public.marketplace_daily_financials (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.marketplace_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  currency text not null default 'TRY' check (char_length(currency)=3),
  gross_sales numeric(18,2) not null default 0,
  gross_returns numeric(18,2) not null default 0,
  commission_cost numeric(18,2) not null default 0,
  discount_cost numeric(18,2) not null default 0,
  coupon_cost numeric(18,2) not null default 0,
  provision_net numeric(18,2) not null default 0,
  seller_revenue numeric(18,2) not null default 0,
  transaction_count integer not null default 0 check (transaction_count >= 0),
  source_window_start timestamptz,
  source_window_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, day, currency)
);

create index marketplace_daily_financials_user_day_idx
  on public.marketplace_daily_financials(user_id, day desc);
create index marketplace_daily_financials_connection_day_idx
  on public.marketplace_daily_financials(connection_id, day desc);

create table public.marketplace_product_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.marketplace_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  external_product_id text not null check (char_length(external_product_id) between 1 and 180),
  sku text check (sku is null or char_length(sku) <= 180),
  barcode text check (barcode is null or char_length(barcode) <= 180),
  product_name text check (product_name is null or char_length(product_name) <= 300),
  orders integer not null default 0 check (orders >= 0),
  units integer not null default 0 check (units >= 0),
  gross_sales numeric(18,2) not null default 0,
  gross_returns numeric(18,2) not null default 0,
  commission_cost numeric(18,2) not null default 0,
  seller_revenue numeric(18,2) not null default 0,
  known_cogs numeric(18,2),
  estimated_profit numeric(18,2),
  estimated_margin numeric(9,4),
  profit_confidence text not null default 'platform_only' check (profit_confidence in ('platform_only','cost_known','estimated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, day, external_product_id)
);

create index marketplace_product_daily_metrics_user_day_idx
  on public.marketplace_product_daily_metrics(user_id, day desc);
create index marketplace_product_daily_metrics_connection_day_idx
  on public.marketplace_product_daily_metrics(connection_id, day desc);
create index marketplace_product_daily_metrics_connection_product_idx
  on public.marketplace_product_daily_metrics(connection_id, external_product_id, day desc);

create table public.marketplace_product_costs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.marketplace_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  external_product_id text not null check (char_length(external_product_id) between 1 and 180),
  cost_amount numeric(18,2) not null check (cost_amount >= 0),
  purchase_vat_rate numeric(6,3) not null default 20 check (purchase_vat_rate between 0 and 100),
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create index marketplace_product_costs_lookup_idx
  on public.marketplace_product_costs(connection_id, external_product_id, valid_from desc);
create index marketplace_product_costs_user_idx
  on public.marketplace_product_costs(user_id, created_at desc);

alter table public.marketplace_daily_financials enable row level security;
alter table public.marketplace_product_daily_metrics enable row level security;
alter table public.marketplace_product_costs enable row level security;

revoke all on table public.marketplace_daily_financials from anon, authenticated;
revoke all on table public.marketplace_product_daily_metrics from anon, authenticated;
revoke all on table public.marketplace_product_costs from anon, authenticated;

grant select on table public.marketplace_daily_financials to authenticated;
grant select on table public.marketplace_product_daily_metrics to authenticated;
grant select on table public.marketplace_product_costs to authenticated;

create policy marketplace_daily_financials_select_own
on public.marketplace_daily_financials
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy marketplace_product_daily_metrics_select_own
on public.marketplace_product_daily_metrics
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy marketplace_product_costs_select_own
on public.marketplace_product_costs
for select
to authenticated
using ((select auth.uid()) = user_id);
