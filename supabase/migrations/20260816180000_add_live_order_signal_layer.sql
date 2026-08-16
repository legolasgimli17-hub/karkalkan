create table if not exists public.marketplace_webhooks (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_webhook_id text,
  secret_hash text not null check (char_length(secret_hash)=64),
  endpoint_url text not null,
  status text not null default 'active' check (status in ('active','disabled','error')),
  subscribed_statuses text[] not null default '{}'::text[],
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_webhooks_connection_owner_fkey foreign key (connection_id,user_id) references public.marketplace_connections(id,user_id) on delete cascade
);

create table if not exists public.marketplace_order_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_fingerprint text not null unique check (char_length(event_fingerprint)=64),
  package_id text not null check (char_length(package_id) between 1 and 120),
  order_number text,
  status text not null check (char_length(status) between 1 and 80),
  event_at timestamptz not null default now(),
  total_amount numeric(18,2),
  line_count integer not null default 0 check (line_count>=0),
  line_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint marketplace_order_events_connection_owner_fkey foreign key (connection_id,user_id) references public.marketplace_connections(id,user_id) on delete cascade
);

create table if not exists public.marketplace_live_orders (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id text not null check (char_length(package_id) between 1 and 120),
  order_number text,
  status text not null check (char_length(status) between 1 and 80),
  event_at timestamptz not null default now(),
  total_amount numeric(18,2),
  line_count integer not null default 0 check (line_count>=0),
  updated_at timestamptz not null default now(),
  unique(connection_id,package_id),
  constraint marketplace_live_orders_connection_owner_fkey foreign key (connection_id,user_id) references public.marketplace_connections(id,user_id) on delete cascade
);

create index if not exists marketplace_webhooks_user_idx on public.marketplace_webhooks(user_id,updated_at desc);
create index if not exists marketplace_order_events_connection_event_idx on public.marketplace_order_events(connection_id,event_at desc);
create index if not exists marketplace_order_events_user_event_idx on public.marketplace_order_events(user_id,event_at desc);
create index if not exists marketplace_live_orders_connection_event_idx on public.marketplace_live_orders(connection_id,event_at desc);
create index if not exists marketplace_live_orders_user_event_idx on public.marketplace_live_orders(user_id,event_at desc);

alter table public.marketplace_webhooks enable row level security;
alter table public.marketplace_order_events enable row level security;
alter table public.marketplace_live_orders enable row level security;

revoke all on table public.marketplace_webhooks from anon, authenticated;
revoke all on table public.marketplace_order_events from anon, authenticated;
revoke all on table public.marketplace_live_orders from anon, authenticated;

grant select on table public.marketplace_webhooks to authenticated;
grant select on table public.marketplace_order_events to authenticated;
grant select on table public.marketplace_live_orders to authenticated;

create policy marketplace_webhooks_select_own on public.marketplace_webhooks for select to authenticated using ((select auth.uid())=user_id);
create policy marketplace_order_events_select_own on public.marketplace_order_events for select to authenticated using ((select auth.uid())=user_id);
create policy marketplace_live_orders_select_own on public.marketplace_live_orders for select to authenticated using ((select auth.uid())=user_id);