alter table public.marketplace_connections
  add column if not exists sync_lock_token uuid,
  add column if not exists sync_lock_until timestamptz;

create index if not exists marketplace_connections_sync_lock_idx
  on public.marketplace_connections(sync_lock_until)
  where sync_lock_until is not null;

alter table public.marketplace_sync_runs
  add column if not exists worker_version text check (worker_version is null or char_length(worker_version) <= 40);
