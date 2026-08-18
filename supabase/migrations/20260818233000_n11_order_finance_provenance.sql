-- n11 currently exposes order economics and approved-return data through its
-- public APIs, while cargo and final statement adjustments remain report-only.
-- The explicit provenance labels prevent this scope from being shown as an
-- exact bank-settlement result.

alter table public.marketplace_daily_financials
  drop constraint if exists marketplace_daily_financials_settlement_coverage_check;

alter table public.marketplace_daily_financials
  add constraint marketplace_daily_financials_settlement_coverage_check
  check (settlement_coverage in (
    'sale_return_core',
    'settlement_adjustments_v1',
    'hepsiburada_finance_v1',
    'n11_order_api_estimate_v1'
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
    'n11_order_api_partial_v1'
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
    'n11_order_api_with_approved_returns_v1'
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
    'n11_shipment_line_quantity'
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
    'n11_approved_return_quantity'
  ));

comment on column public.marketplace_daily_financials.settlement_coverage is
  'Provider-specific finance provenance. n11 order API values are estimates until statement and cargo reports are reconciled.';
