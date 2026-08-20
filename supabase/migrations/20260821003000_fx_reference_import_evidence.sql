begin;

create table if not exists public.fx_rates_daily (
  rate_date date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  units_per_eur numeric(24,10) not null check (units_per_eur > 0),
  source text not null default 'ecb_reference' check (source = 'ecb_reference'),
  retrieved_at timestamptz not null default now(),
  primary key (rate_date, currency)
);

alter table public.fx_rates_daily enable row level security;
revoke all on table public.fx_rates_daily from anon, authenticated;

create table if not exists public.marketplace_fx_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  source text not null default 'normalized_csv_ecb' check (source = 'normalized_csv_ecb'),
  base_currency text not null default 'TRY' check (base_currency = 'TRY'),
  status text not null default 'pending' check (status in ('pending','success','failed')),
  row_count integer not null check (row_count > 0 and row_count <= 5000),
  source_currencies text[] not null default '{}',
  fx_reference_variance_try numeric(20,2) not null default 0,
  safe_error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint marketplace_fx_import_batches_connection_owner_fkey
    foreign key (connection_id, user_id)
    references public.marketplace_connections(id, user_id)
    on delete cascade
);

create index if not exists marketplace_fx_import_batches_user_created_idx
  on public.marketplace_fx_import_batches(user_id, created_at desc);
create index if not exists marketplace_fx_import_batches_connection_created_idx
  on public.marketplace_fx_import_batches(connection_id, created_at desc);

alter table public.marketplace_fx_import_batches enable row level security;
revoke all on table public.marketplace_fx_import_batches from anon, authenticated;

create table if not exists public.marketplace_fx_import_daily (
  batch_id uuid not null references public.marketplace_fx_import_batches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  day date not null,
  settlement_day date,
  original_currency text not null check (original_currency ~ '^[A-Z]{3}$'),
  base_currency text not null default 'TRY' check (base_currency = 'TRY'),
  transaction_rate_date date not null,
  transaction_rate_to_try numeric(24,10) not null check (transaction_rate_to_try > 0),
  settlement_rate_date date,
  settlement_rate_to_try numeric(24,10) check (settlement_rate_to_try is null or settlement_rate_to_try > 0),
  original_gross_sales numeric(20,2) not null default 0,
  original_gross_returns numeric(20,2) not null default 0,
  original_commission_cost numeric(20,2) not null default 0,
  original_discount_cost numeric(20,2) not null default 0,
  original_coupon_cost numeric(20,2) not null default 0,
  original_seller_revenue numeric(20,2),
  converted_gross_sales_try numeric(20,2) not null default 0,
  converted_gross_returns_try numeric(20,2) not null default 0,
  converted_commission_cost_try numeric(20,2) not null default 0,
  converted_discount_cost_try numeric(20,2) not null default 0,
  converted_coupon_cost_try numeric(20,2) not null default 0,
  converted_seller_revenue_try numeric(20,2),
  fx_reference_variance_try numeric(20,2) not null default 0,
  row_count integer not null default 0 check (row_count > 0),
  primary key (batch_id, day, original_currency, settlement_day),
  constraint marketplace_fx_import_daily_connection_owner_fkey
    foreign key (connection_id, user_id)
    references public.marketplace_connections(id, user_id)
    on delete cascade
);

create index if not exists marketplace_fx_import_daily_user_day_idx
  on public.marketplace_fx_import_daily(user_id, day desc);
create index if not exists marketplace_fx_import_daily_connection_day_idx
  on public.marketplace_fx_import_daily(connection_id, day desc);

alter table public.marketplace_fx_import_daily enable row level security;
revoke all on table public.marketplace_fx_import_daily from anon, authenticated;

commit;
