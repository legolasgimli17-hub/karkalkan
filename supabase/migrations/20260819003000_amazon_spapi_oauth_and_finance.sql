-- Amazon Türkiye SP-API authorization state and Finances API provenance.
-- OAuth refresh tokens remain in Supabase Vault; only one-time state hashes
-- and safe lifecycle metadata are stored in public tables.

alter table public.marketplace_connections
  drop constraint if exists marketplace_connections_capability_tier_check;

alter table public.marketplace_connections
  add constraint marketplace_connections_capability_tier_check
  check (capability_tier in ('live','verified','ready','beta','gated','import'));

create table public.amazon_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  connection_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint amazon_oauth_states_connection_owner_fkey
    foreign key (connection_id, user_id)
    references public.marketplace_connections(id, user_id)
    on delete cascade,
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

create index amazon_oauth_states_expiry_idx
  on public.amazon_oauth_states(expires_at)
  where consumed_at is null;

create index amazon_oauth_states_connection_owner_idx
  on public.amazon_oauth_states(connection_id, user_id);

alter table public.amazon_oauth_states enable row level security;
revoke all on table public.amazon_oauth_states from anon, authenticated;

comment on table public.amazon_oauth_states is
  'Server-only, short-lived, one-use SHA-256 hashes for Amazon SP-API OAuth CSRF protection. Raw state and tokens are never stored here.';

alter table public.marketplace_daily_financials
  drop constraint if exists marketplace_daily_financials_settlement_coverage_check;

alter table public.marketplace_daily_financials
  add constraint marketplace_daily_financials_settlement_coverage_check
  check (settlement_coverage in (
    'sale_return_core',
    'settlement_adjustments_v1',
    'hepsiburada_finance_v1',
    'n11_order_api_estimate_v1',
    'amazon_finances_2024_06_19'
  ));

alter table public.marketplace_daily_financials
  drop constraint if exists marketplace_daily_financials_other_financial_coverage_check;

alter table public.marketplace_daily_financials
  add constraint marketplace_daily_financials_other_financial_coverage_check
  check (other_financial_coverage in (
    'none',
    'platform_service_fee',
    'cargo',
    'platform_service_fee_and_cargo',
    'hepsiburada_finance_v1',
    'n11_order_api_partial_v1',
    'amazon_finances_2024_06_19'
  ));

alter table public.marketplace_product_daily_metrics
  drop constraint if exists marketplace_product_daily_metrics_unit_basis_check;

alter table public.marketplace_product_daily_metrics
  add constraint marketplace_product_daily_metrics_unit_basis_check
  check (unit_basis in (
    'settlement_transaction_proxy',
    'order_v2_sales_settlement_return_proxy',
    'order_v2_exact_sales',
    'mixed_fallback',
    'order_v2_sales_claims_accepted_returns',
    'hepsiburada_finance_performance_v1',
    'n11_order_api_with_approved_returns_v1',
    'amazon_finances_2024_06_19'
  ));

alter table public.marketplace_product_daily_metrics
  drop constraint if exists marketplace_product_daily_metrics_sales_unit_basis_check;

alter table public.marketplace_product_daily_metrics
  add constraint marketplace_product_daily_metrics_sales_unit_basis_check
  check (sales_unit_basis in (
    'settlement_transaction_proxy',
    'order_v2_quantity',
    'mixed_fallback',
    'hepsiburada_performance_quantity',
    'n11_shipment_line_quantity',
    'amazon_finances_product_context_quantity'
  ));

alter table public.marketplace_product_daily_metrics
  drop constraint if exists marketplace_product_daily_metrics_return_unit_basis_check;

alter table public.marketplace_product_daily_metrics
  add constraint marketplace_product_daily_metrics_return_unit_basis_check
  check (return_unit_basis in (
    'settlement_transaction_proxy',
    'claims_accepted_items',
    'mixed_fallback',
    'hepsiburada_transaction_return_proxy',
    'n11_approved_return_quantity',
    'amazon_finances_product_context_quantity'
  ));

comment on column public.marketplace_daily_financials.settlement_coverage is
  'Provider-specific finance provenance. Amazon values use released transactions from Finances API v2024-06-19 and can lag by up to 48 hours.';
