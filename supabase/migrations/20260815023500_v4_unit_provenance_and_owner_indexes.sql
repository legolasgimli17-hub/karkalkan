-- KârKalkan v4 marketplace data provenance + owner FK index coverage.
-- Safe to re-run on environments where the columns/indexes already exist.

alter table public.marketplace_product_daily_metrics
  add column if not exists sales_units integer not null default 0,
  add column if not exists return_units integer not null default 0,
  add column if not exists unit_basis text not null default 'settlement_transaction_proxy',
  add column if not exists order_line_matches integer not null default 0,
  add column if not exists return_proxy_matches integer not null default 0;

alter table public.marketplace_product_daily_metrics
  drop constraint if exists marketplace_product_daily_metrics_unit_basis_check;

alter table public.marketplace_product_daily_metrics
  add constraint marketplace_product_daily_metrics_unit_basis_check
  check (
    unit_basis in (
      'settlement_transaction_proxy',
      'order_v2_sales_settlement_return_proxy',
      'order_v2_exact_sales',
      'mixed_fallback'
    )
  );

comment on column public.marketplace_product_daily_metrics.sales_units is
  'Sold unit count. Provenance is described by unit_basis.';
comment on column public.marketplace_product_daily_metrics.return_units is
  'Returned unit estimate/count. Provenance is described by unit_basis.';
comment on column public.marketplace_product_daily_metrics.unit_basis is
  'Explains whether units originate from Order V2 quantities or settlement transaction proxies.';
comment on column public.marketplace_product_daily_metrics.order_line_matches is
  'Number of unique settlement sale order+barcode keys matched to Order V2.';
comment on column public.marketplace_product_daily_metrics.return_proxy_matches is
  'Number of settlement return rows used as return-unit proxy.';

create index if not exists marketplace_daily_financials_connection_owner_idx
  on public.marketplace_daily_financials(connection_id, user_id);

create index if not exists marketplace_product_costs_connection_owner_idx
  on public.marketplace_product_costs(connection_id, user_id);

create index if not exists marketplace_product_daily_metrics_connection_owner_idx
  on public.marketplace_product_daily_metrics(connection_id, user_id);

create index if not exists marketplace_sync_runs_connection_owner_idx
  on public.marketplace_sync_runs(connection_id, user_id);
