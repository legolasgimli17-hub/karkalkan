-- Server-only abuse-control state and stronger Amazon OAuth subject binding.

create table if not exists public.edge_rate_limits (
  scope text not null check (scope ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  bucket_start timestamptz not null,
  hits integer not null default 1 check (hits >= 1),
  expires_at timestamptz not null,
  primary key (scope,key_hash,bucket_start),
  check (expires_at > bucket_start)
);

create index if not exists edge_rate_limits_expiry_idx
  on public.edge_rate_limits(expires_at);

alter table public.edge_rate_limits enable row level security;
revoke all on table public.edge_rate_limits from public, anon, authenticated;

drop policy if exists edge_rate_limits_deny_browser on public.edge_rate_limits;
create policy edge_rate_limits_deny_browser
on public.edge_rate_limits
for all
to anon, authenticated
using (false)
with check (false);

comment on table public.edge_rate_limits is
  'Short-lived, hashed abuse-control buckets. No IP addresses, tokens, credentials or request bodies are stored.';

alter table public.amazon_oauth_states
  add column if not exists expected_seller_id text;

alter table public.amazon_oauth_states
  drop constraint if exists amazon_oauth_states_expected_seller_id_check;

alter table public.amazon_oauth_states
  add constraint amazon_oauth_states_expected_seller_id_check
  check (expected_seller_id is null or expected_seller_id ~ '^[A-Za-z0-9_-]{5,120}$');

create index if not exists amazon_oauth_states_user_idx
  on public.amazon_oauth_states(user_id);

-- Keep this transient OAuth table completely server-only while avoiding an
-- ambiguous no-policy advisor finding.
drop policy if exists amazon_oauth_states_deny_browser on public.amazon_oauth_states;
create policy amazon_oauth_states_deny_browser
on public.amazon_oauth_states
for all
to anon, authenticated
using (false)
with check (false);
