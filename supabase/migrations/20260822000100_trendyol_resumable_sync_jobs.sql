-- Persist resumable Trendyol sync progress without exposing job internals to browser roles.

create table if not exists public.marketplace_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  marketplace text not null default 'trendyol' check (marketplace in ('trendyol')),
  requested_days smallint not null check (requested_days in (7,30)),
  range_start date not null,
  range_end date not null,
  chunk_days smallint not null default 3 check (chunk_days between 1 and 3),
  total_chunks smallint not null check (total_chunks between 1 and 31),
  completed_chunks smallint not null default 0 check (completed_chunks >= 0 and completed_chunks <= total_chunks),
  status text not null default 'pending' check (status in ('pending','running','retry_wait','success','failed','cancelled')),
  lease_token uuid,
  lease_expires_at timestamptz,
  safe_error_code text check (safe_error_code is null or char_length(safe_error_code) <= 80),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_sync_jobs_range_check check (range_end >= range_start),
  constraint marketplace_sync_jobs_connection_owner_fkey foreign key (connection_id,user_id)
    references public.marketplace_connections(id,user_id) on delete cascade
);

create table if not exists public.marketplace_sync_job_chunks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.marketplace_sync_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null,
  chunk_index smallint not null check (chunk_index >= 0),
  range_start date not null,
  range_end date not null,
  status text not null default 'pending' check (status in ('pending','running','retry_wait','success','failed','cancelled')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 10),
  next_retry_at timestamptz,
  safe_error_code text check (safe_error_code is null or char_length(safe_error_code) <= 80),
  core_summary jsonb not null default '{}'::jsonb,
  auxiliary_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_sync_job_chunks_range_check check (range_end >= range_start),
  constraint marketplace_sync_job_chunks_job_index_key unique (job_id,chunk_index),
  constraint marketplace_sync_job_chunks_connection_owner_fkey foreign key (connection_id,user_id)
    references public.marketplace_connections(id,user_id) on delete cascade
);

create unique index if not exists marketplace_sync_jobs_one_active_per_connection_idx
  on public.marketplace_sync_jobs(user_id,connection_id)
  where status in ('pending','running','retry_wait');
create index if not exists marketplace_sync_jobs_user_updated_idx
  on public.marketplace_sync_jobs(user_id,updated_at desc);
create index if not exists marketplace_sync_jobs_connection_status_idx
  on public.marketplace_sync_jobs(connection_id,status,updated_at desc);
create index if not exists marketplace_sync_job_chunks_job_status_idx
  on public.marketplace_sync_job_chunks(job_id,status,chunk_index);
create index if not exists marketplace_sync_job_chunks_connection_owner_idx
  on public.marketplace_sync_job_chunks(connection_id,user_id);

alter table public.marketplace_sync_jobs enable row level security;
alter table public.marketplace_sync_job_chunks enable row level security;

revoke all on table public.marketplace_sync_jobs from anon, authenticated;
revoke all on table public.marketplace_sync_job_chunks from anon, authenticated;
grant select, insert, update, delete on table public.marketplace_sync_jobs to service_role;
grant select, insert, update, delete on table public.marketplace_sync_job_chunks to service_role;

comment on table public.marketplace_sync_jobs is 'Server-only resumable marketplace sync job state; no raw seller/customer payloads.';
comment on table public.marketplace_sync_job_chunks is 'Server-only bounded date chunks and aggregate sync summaries; no credentials or customer PII.';
