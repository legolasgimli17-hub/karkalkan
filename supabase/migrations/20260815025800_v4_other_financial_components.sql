-- KârKalkan v4: Other Financials enrichment components.

alter table public.marketplace_daily_financials
  add column if not exists platform_service_fee_cost numeric not null default 0,
  add column if not exists cargo_cost numeric not null default 0,
  add column if not exists other_financial_coverage text not null default 'none';

alter table public.marketplace_daily_financials
  drop constraint if exists marketplace_daily_financials_other_financial_coverage_check;

alter table public.marketplace_daily_financials
  add constraint marketplace_daily_financials_other_financial_coverage_check
  check (other_financial_coverage in (
    'none',
    'platform_service_fee',
    'platform_service_fee_and_cargo'
  ));

comment on column public.marketplace_daily_financials.platform_service_fee_cost is
  'Signed net PlatformServiceFee cost from Trendyol Other Financials (debt minus credit).';
comment on column public.marketplace_daily_financials.cargo_cost is
  'Signed net cargo invoice item cost from Trendyol cargo invoice detail service.';
comment on column public.marketplace_daily_financials.other_financial_coverage is
  'Other Financial enrichment scope applied to the daily row.';
