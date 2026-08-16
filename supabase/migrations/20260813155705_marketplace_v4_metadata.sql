create table public.marketplace_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marketplace text not null check (marketplace in ('trendyol','hepsiburada','amazon')),
  display_name text not null check (char_length(display_name) between 1 and 120),
  external_seller_id text check (external_seller_id is null or char_length(external_seller_id) between 1 and 120),
  status text not null default 'pending' check (status in ('pending','connected','reauth_required','error','disabled')),
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status is null or last_sync_status in ('success','partial','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index marketplace_connections_user_marketplace_seller_uq
  on public.marketplace_connections(user_id, marketplace, external_seller_id)
  where external_seller_id is not null;
create index marketplace_connections_user_idx
  on public.marketplace_connections(user_id, created_at desc);

create table public.marketplace_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.marketplace_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  range_start timestamptz not null,
  range_end timestamptz not null,
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  imported_orders integer not null default 0 check (imported_orders >= 0),
  imported_transactions integer not null default 0 check (imported_transactions >= 0),
  safe_error_code text check (safe_error_code is null or char_length(safe_error_code) <= 80),
  result_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  check (range_end >= range_start)
);
create index marketplace_sync_runs_user_idx on public.marketplace_sync_runs(user_id, started_at desc);
create index marketplace_sync_runs_connection_idx on public.marketplace_sync_runs(connection_id, started_at desc);

alter table public.marketplace_connections enable row level security;
alter table public.marketplace_sync_runs enable row level security;

revoke all on table public.marketplace_connections from anon, authenticated;
revoke all on table public.marketplace_sync_runs from anon, authenticated;
grant select on table public.marketplace_connections to authenticated;
grant select on table public.marketplace_sync_runs to authenticated;

create policy marketplace_connections_select_own
on public.marketplace_connections
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy marketplace_sync_runs_select_own
on public.marketplace_sync_runs
for select
to authenticated
using ((select auth.uid()) = user_id);
