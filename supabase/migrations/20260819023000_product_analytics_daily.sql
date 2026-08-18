-- Privacy-minimal product activation analytics.
-- This table stores aggregate daily counters only. It deliberately contains no
-- user, store, marketplace credential, product, bank, or financial identifiers.

create table public.product_analytics_daily (
  day date not null,
  event_name text not null check (event_name in (
    'onboarding_stage_viewed',
    'onboarding_completed',
    'onboarding_next_clicked',
    'onboarding_step_clicked'
  )),
  stage text not null default 'none' check (stage in (
    'none','store','data','cost','decision','complete'
  )),
  completed_steps smallint not null default 0 check (completed_steps between 0 and 4),
  target_step text not null default 'none' check (target_step in (
    'none','store','data','cost','decision'
  )),
  event_count bigint not null default 0 check (event_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, event_name, stage, completed_steps, target_step)
);

alter table public.product_analytics_daily enable row level security;

-- Browsers cannot read or write analytics aggregates directly. Authenticated
-- ingestion goes through the bounded product-analytics Edge Function.
revoke all on table public.product_analytics_daily from anon, authenticated;

comment on table public.product_analytics_daily is
  'Aggregate-only activation funnel counters. No user/store/product/bank/financial identifiers are stored.';
comment on column public.product_analytics_daily.day is
  'UTC calendar day used for aggregate reporting.';
