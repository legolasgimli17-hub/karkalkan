-- KârKalkan v4: separate sales/return unit provenance and claim evidence.

alter table public.marketplace_product_daily_metrics
  add column if not exists sales_unit_basis text not null default 'settlement_transaction_proxy',
  add column if not exists return_unit_basis text not null default 'settlement_transaction_proxy',
  add column if not exists claim_item_matches integer not null default 0;

alter table public.marketplace_product_daily_metrics
  drop constraint if exists marketplace_product_daily_metrics_sales_unit_basis_check;

alter table public.marketplace_product_daily_metrics
  add constraint marketplace_product_daily_metrics_sales_unit_basis_check
  check (sales_unit_basis in (
    'settlement_transaction_proxy',
    'order_v2_quantity',
    'mixed_fallback'
  ));

alter table public.marketplace_product_daily_metrics
  drop constraint if exists marketplace_product_daily_metrics_return_unit_basis_check;

alter table public.marketplace_product_daily_metrics
  add constraint marketplace_product_daily_metrics_return_unit_basis_check
  check (return_unit_basis in (
    'settlement_transaction_proxy',
    'claims_accepted_items',
    'mixed_fallback'
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
    'order_v2_sales_claims_accepted_returns'
  ));

comment on column public.marketplace_product_daily_metrics.sales_unit_basis is
  'Sales unit provenance: Order V2 quantity, settlement proxy, or mixed fallback.';
comment on column public.marketplace_product_daily_metrics.return_unit_basis is
  'Return unit provenance: accepted claim items, settlement proxy, or mixed fallback.';
comment on column public.marketplace_product_daily_metrics.claim_item_matches is
  'Accepted Trendyol claim items allocated to this product/day and used as return-unit evidence.';
