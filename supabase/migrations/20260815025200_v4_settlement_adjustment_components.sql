-- KârKalkan v4: expand daily Trendyol settlement coverage without mixing
-- store-level adjustments into product-level COGS/profit.

alter table public.marketplace_daily_financials
  add column if not exists manual_refund_net numeric not null default 0,
  add column if not exists platform_promo_net numeric not null default 0,
  add column if not exists delivery_fee_net numeric not null default 0,
  add column if not exists correction_net numeric not null default 0,
  add column if not exists settlement_adjustment_net numeric not null default 0,
  add column if not exists settlement_coverage text not null default 'sale_return_core';

alter table public.marketplace_daily_financials
  drop constraint if exists marketplace_daily_financials_settlement_coverage_check;

alter table public.marketplace_daily_financials
  add constraint marketplace_daily_financials_settlement_coverage_check
  check (settlement_coverage in ('sale_return_core','settlement_adjustments_v1'));

comment on column public.marketplace_daily_financials.manual_refund_net is
  'Signed sellerRevenue effect from ManualRefund and ManualRefundCancel settlement records.';
comment on column public.marketplace_daily_financials.platform_promo_net is
  'Signed settlement sellerRevenue effect from Trendyol-funded TyDiscount/TyCoupon pairs; kept separate because later invoice compensation may exist.';
comment on column public.marketplace_daily_financials.delivery_fee_net is
  'Signed sellerRevenue effect from DeliveryFee and DeliveryFeeCancel; this is not modeled as cargo cost.';
comment on column public.marketplace_daily_financials.correction_net is
  'Signed sellerRevenue/cash effect from settlement correction records; correction-pair semantics must remain conservative until real-data validation.';
comment on column public.marketplace_daily_financials.settlement_adjustment_net is
  'Sum of non-Sale/Return settlement effects fetched by KârKalkan. Kept separate from product-level profit.';
comment on column public.marketplace_daily_financials.settlement_coverage is
  'Scope of settlement transaction types included in this daily row.';
