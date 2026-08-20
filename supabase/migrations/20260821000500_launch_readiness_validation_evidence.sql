create table if not exists public.marketplace_validation_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  marketplace text not null check (marketplace in ('trendyol')),
  period_start date not null,
  period_end date not null,
  status text not null check (status in ('matched','review_required')),
  evidence_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_validation_evidence_period_check check (period_end >= period_start),
  constraint marketplace_validation_evidence_owner_fk foreign key (connection_id,user_id)
    references public.marketplace_connections(id,user_id) on delete cascade,
  unique (user_id, connection_id, period_start, period_end)
);

create index if not exists marketplace_validation_evidence_user_status_idx
  on public.marketplace_validation_evidence(user_id, marketplace, status, updated_at desc);
create index if not exists marketplace_validation_evidence_connection_idx
  on public.marketplace_validation_evidence(connection_id, period_start, period_end);

alter table public.marketplace_validation_evidence enable row level security;
revoke all on public.marketplace_validation_evidence from anon, authenticated;
grant select, insert, update, delete on public.marketplace_validation_evidence to service_role;

comment on table public.marketplace_validation_evidence is
  'Server-only aggregate reconciliation evidence. Never store raw marketplace statements, credentials, customer data or order-level PII here.';
