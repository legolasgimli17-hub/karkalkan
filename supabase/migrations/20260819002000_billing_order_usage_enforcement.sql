-- Server-side monthly order quota enforcement.
--
-- Exact order IDs are not persisted consistently across every supported ingest path yet.
-- The enforcement metric is therefore intentionally conservative:
--   * API-backed product rows use distinct-per-product `orders` when available.
--   * normalized CSV/proxy rows use sales units as an upper bound so summary imports
--     cannot bypass the quota by collapsing many orders into one product/day row.
-- A multi-product order can be counted more than once. This fails closed (early)
-- rather than allowing a paid order quota to be exceeded silently.

create table if not exists public.billing_order_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  day date not null,
  order_equivalents integer not null default 0 check (order_equivalents >= 0),
  basis text not null check (basis in ('conservative_product_orders','conservative_proxy_units')),
  updated_at timestamptz not null default now(),
  primary key (connection_id, day),
  constraint billing_order_usage_daily_connection_owner_fk
    foreign key (connection_id, user_id)
    references public.marketplace_connections(id, user_id)
    on delete cascade
);

create index if not exists billing_order_usage_daily_user_day_idx
  on public.billing_order_usage_daily(user_id, day);

alter table public.billing_order_usage_daily enable row level security;
revoke all on table public.billing_order_usage_daily from anon, authenticated;

create or replace function public.karkalkan_order_entitlement(p_user_id uuid)
returns table(order_limit integer, period_start date, period_end date, plan_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text := 'free';
  v_status text := 'inactive';
  v_start date;
  v_end date;
  v_now date := (now() at time zone 'Europe/Istanbul')::date;
begin
  select coalesce(b.plan_key,'free'), coalesce(b.status,'inactive'),
         (b.current_period_start at time zone 'Europe/Istanbul')::date,
         (b.current_period_end at time zone 'Europe/Istanbul')::date
    into v_plan, v_status, v_start, v_end
  from public.billing_subscriptions b
  where b.user_id = p_user_id
  limit 1;

  if not found then
    v_plan := 'free';
    v_status := 'inactive';
    v_start := null;
    v_end := null;
  end if;

  if v_status not in ('trialing','active','past_due') or v_plan not in ('starter','growth','scale') then
    v_plan := 'free';
  end if;

  order_limit := case v_plan
    when 'growth' then 5000
    when 'scale' then 50000
    else 500
  end;
  plan_key := v_plan;

  if v_plan <> 'free' and v_start is not null and v_end is not null and v_end > v_start then
    period_start := v_start;
    period_end := v_end;
  else
    period_start := date_trunc('month', v_now::timestamp)::date;
    period_end := (date_trunc('month', v_now::timestamp) + interval '1 month')::date;
  end if;
  return next;
end;
$$;

revoke all on function public.karkalkan_order_entitlement(uuid) from public, anon, authenticated;

create or replace function public.karkalkan_refresh_order_usage_day(
  p_user_id uuid,
  p_connection_id uuid,
  p_day date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage integer := 0;
  v_proxy boolean := false;
  v_limit integer;
  v_period_start date;
  v_period_end date;
  v_plan text;
  v_period_usage bigint := 0;
begin
  if p_user_id is null or p_connection_id is null or p_day is null then
    return;
  end if;

  -- Serialize all quota-changing writes for this tenant. Without this lock two
  -- stores could cross the same monthly quota concurrently and both commit.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 7193));

  select
    coalesce(sum(
      case
        when m.sales_unit_basis = 'settlement_transaction_proxy'
          then greatest(coalesce(m.orders,0), coalesce(m.sales_units,0))
        when coalesce(m.orders,0) > 0
          then m.orders
        else coalesce(m.sales_units,0)
      end
    ),0)::integer,
    coalesce(bool_or(m.sales_unit_basis = 'settlement_transaction_proxy'),false)
  into v_usage, v_proxy
  from public.marketplace_product_daily_metrics m
  where m.user_id = p_user_id
    and m.connection_id = p_connection_id
    and m.day = p_day;

  if v_usage <= 0 then
    delete from public.billing_order_usage_daily u
    where u.user_id = p_user_id
      and u.connection_id = p_connection_id
      and u.day = p_day;
  else
    insert into public.billing_order_usage_daily(user_id,connection_id,day,order_equivalents,basis,updated_at)
    values(
      p_user_id,
      p_connection_id,
      p_day,
      v_usage,
      case when v_proxy then 'conservative_proxy_units' else 'conservative_product_orders' end,
      now()
    )
    on conflict (connection_id,day) do update
      set user_id = excluded.user_id,
          order_equivalents = excluded.order_equivalents,
          basis = excluded.basis,
          updated_at = now();
  end if;

  select e.order_limit,e.period_start,e.period_end,e.plan_key
    into v_limit,v_period_start,v_period_end,v_plan
  from public.karkalkan_order_entitlement(p_user_id) e;

  -- Historical re-syncs must not be rejected because a customer later changed
  -- plans. Only the currently active billing/free period is enforced.
  if p_day < v_period_start or p_day >= v_period_end then
    return;
  end if;

  select coalesce(sum(u.order_equivalents),0)
    into v_period_usage
  from public.billing_order_usage_daily u
  where u.user_id = p_user_id
    and u.day >= v_period_start
    and u.day < v_period_end;

  if v_period_usage > v_limit then
    raise exception using
      errcode = 'P0001',
      message = 'PLAN_ORDER_LIMIT_REACHED',
      detail = format('orders_used=%s order_limit=%s plan=%s',v_period_usage,v_limit,v_plan);
  end if;
end;
$$;

revoke all on function public.karkalkan_refresh_order_usage_day(uuid,uuid,date) from public, anon, authenticated;

-- Backfill the read model before the trigger is installed. Production currently
-- has no seller metrics, but this keeps the migration correct for populated envs.
insert into public.billing_order_usage_daily(user_id,connection_id,day,order_equivalents,basis,updated_at)
select
  m.user_id,
  m.connection_id,
  m.day,
  sum(
    case
      when m.sales_unit_basis = 'settlement_transaction_proxy'
        then greatest(coalesce(m.orders,0), coalesce(m.sales_units,0))
      when coalesce(m.orders,0) > 0
        then m.orders
      else coalesce(m.sales_units,0)
    end
  )::integer as order_equivalents,
  case when bool_or(m.sales_unit_basis = 'settlement_transaction_proxy')
    then 'conservative_proxy_units'
    else 'conservative_product_orders'
  end as basis,
  now()
from public.marketplace_product_daily_metrics m
group by m.user_id,m.connection_id,m.day
having sum(
  case
    when m.sales_unit_basis = 'settlement_transaction_proxy'
      then greatest(coalesce(m.orders,0), coalesce(m.sales_units,0))
    when coalesce(m.orders,0) > 0
      then m.orders
    else coalesce(m.sales_units,0)
  end
) > 0
on conflict (connection_id,day) do update
  set user_id=excluded.user_id,
      order_equivalents=excluded.order_equivalents,
      basis=excluded.basis,
      updated_at=now();

create or replace function public.karkalkan_product_metric_quota_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE','UPDATE') then
    perform public.karkalkan_refresh_order_usage_day(old.user_id,old.connection_id,old.day);
  end if;

  if tg_op in ('INSERT','UPDATE') then
    if tg_op <> 'UPDATE'
       or new.user_id is distinct from old.user_id
       or new.connection_id is distinct from old.connection_id
       or new.day is distinct from old.day then
      perform public.karkalkan_refresh_order_usage_day(new.user_id,new.connection_id,new.day);
    elsif new.orders is distinct from old.orders
       or new.sales_units is distinct from old.sales_units
       or new.sales_unit_basis is distinct from old.sales_unit_basis then
      perform public.karkalkan_refresh_order_usage_day(new.user_id,new.connection_id,new.day);
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.karkalkan_product_metric_quota_trigger() from public, anon, authenticated;

drop trigger if exists trg_marketplace_product_metric_order_quota on public.marketplace_product_daily_metrics;
create trigger trg_marketplace_product_metric_order_quota
after insert or update of user_id,connection_id,day,orders,sales_units,sales_unit_basis or delete
on public.marketplace_product_daily_metrics
for each row execute function public.karkalkan_product_metric_quota_trigger();
