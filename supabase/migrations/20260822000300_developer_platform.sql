-- Buyer-facing developer platform: scoped API keys and signed outbound webhooks.
-- Browser roles intentionally have no direct access; Edge Functions mediate all operations.

create table if not exists public.developer_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  key_prefix text not null check (key_prefix ~ '^kk_live_[A-Za-z0-9_-]{6,24}$'),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default array['finance:read','products:read','connections:read']::text[],
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_api_keys_scope_check check (
    scopes <@ array['finance:read','products:read','connections:read']::text[]
    and cardinality(scopes) between 1 and 3
  )
);

create index if not exists developer_api_keys_user_created_idx
  on public.developer_api_keys(user_id, created_at desc);
create index if not exists developer_api_keys_active_hash_idx
  on public.developer_api_keys(key_hash)
  where revoked_at is null;

create table if not exists public.developer_webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint_url text not null check (char_length(endpoint_url) between 12 and 500),
  event_types text[] not null default array['sync.completed']::text[],
  status text not null default 'active' check (status in ('active','disabled')),
  vault_secret_id uuid not null unique,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_delivery_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint developer_webhooks_event_check check (
    event_types <@ array['webhook.test','sync.completed','sync.failed','reconciliation.matched']::text[]
    and cardinality(event_types) between 1 and 4
  ),
  unique(user_id, endpoint_url)
);

create index if not exists developer_webhooks_user_status_idx
  on public.developer_webhooks(user_id, status, updated_at desc);

create table if not exists public.developer_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.developer_webhooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  event_type text not null,
  status text not null check (status in ('delivered','failed')),
  http_status integer,
  safe_error_code text,
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique(webhook_id, event_id)
);

create index if not exists developer_webhook_deliveries_user_attempted_idx
  on public.developer_webhook_deliveries(user_id, attempted_at desc);
create index if not exists developer_webhook_deliveries_webhook_attempted_idx
  on public.developer_webhook_deliveries(webhook_id, attempted_at desc);

alter table public.developer_api_keys enable row level security;
alter table public.developer_webhooks enable row level security;
alter table public.developer_webhook_deliveries enable row level security;

revoke all on table public.developer_api_keys from anon, authenticated;
revoke all on table public.developer_webhooks from anon, authenticated;
revoke all on table public.developer_webhook_deliveries from anon, authenticated;

grant select, insert, update, delete on table public.developer_api_keys to service_role;
grant select, insert, update, delete on table public.developer_webhooks to service_role;
grant select, insert, update, delete on table public.developer_webhook_deliveries to service_role;
