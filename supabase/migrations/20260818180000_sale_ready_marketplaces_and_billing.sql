-- Sale-ready provider catalog and Paddle billing state.
-- Secrets stay in Supabase Vault; these tables only contain provider IDs and safe status data.

alter table public.marketplace_connections
  drop constraint if exists marketplace_connections_marketplace_check;

alter table public.marketplace_connections
  add constraint marketplace_connections_marketplace_check
  check (marketplace in ('trendyol','hepsiburada','n11','amazon','flo'));

alter table public.marketplace_connections
  add column if not exists connection_mode text not null default 'api',
  add column if not exists capability_tier text not null default 'gated';

alter table public.marketplace_connections
  drop constraint if exists marketplace_connections_connection_mode_check;
alter table public.marketplace_connections
  add constraint marketplace_connections_connection_mode_check
  check (connection_mode in ('api','oauth','file'));

alter table public.marketplace_connections
  drop constraint if exists marketplace_connections_capability_tier_check;
alter table public.marketplace_connections
  add constraint marketplace_connections_capability_tier_check
  check (capability_tier in ('live','beta','gated','import'));

update public.marketplace_connections
set capability_tier = case marketplace
  when 'trendyol' then 'live'
  when 'hepsiburada' then 'beta'
  when 'n11' then 'beta'
  else 'gated'
end,
connection_mode = case marketplace when 'amazon' then 'oauth' else 'api' end;

create unique index if not exists marketplace_connections_user_marketplace_name_without_seller_uq
  on public.marketplace_connections(user_id, marketplace, lower(display_name))
  where external_seller_id is null;

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  paddle_customer_id text unique check (paddle_customer_id is null or paddle_customer_id ~ '^ctm_[a-z0-9]{26}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  paddle_subscription_id text unique check (paddle_subscription_id is null or paddle_subscription_id ~ '^sub_[a-z0-9]{26}$'),
  paddle_customer_id text check (paddle_customer_id is null or paddle_customer_id ~ '^ctm_[a-z0-9]{26}$'),
  plan_key text not null default 'free' check (plan_key in ('free','starter','growth','scale')),
  status text not null default 'inactive' check (status in ('inactive','trialing','active','past_due','paused','canceled')),
  price_id text check (price_id is null or char_length(price_id) between 1 and 80),
  currency text check (currency is null or char_length(currency) = 3),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  scheduled_change text check (scheduled_change is null or scheduled_change in ('cancel','pause','resume')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_subscriptions_customer_idx
  on public.billing_subscriptions(paddle_customer_id)
  where paddle_customer_id is not null;
create index billing_subscriptions_active_idx
  on public.billing_subscriptions(status, current_period_end desc)
  where status in ('trialing','active','past_due');

create table public.billing_events (
  paddle_event_id text primary key check (char_length(paddle_event_id) between 1 and 100),
  event_type text not null check (char_length(event_type) between 1 and 100),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz,
  processed_at timestamptz not null default now(),
  safe_error_code text check (safe_error_code is null or char_length(safe_error_code) <= 80)
);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_events enable row level security;

revoke all on table public.billing_customers from anon, authenticated;
revoke all on table public.billing_subscriptions from anon, authenticated;
revoke all on table public.billing_events from anon, authenticated;

grant select on table public.billing_customers to authenticated;
grant select on table public.billing_subscriptions to authenticated;

create policy billing_customers_select_own
on public.billing_customers
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy billing_subscriptions_select_own
on public.billing_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

comment on table public.billing_events is
  'Idempotency ledger for verified Paddle webhooks. Raw billing payloads and payment details are intentionally not stored.';
