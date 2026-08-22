-- Cover resumable-sync foreign keys flagged by the Supabase performance advisor.

create index if not exists marketplace_sync_jobs_connection_owner_idx
  on public.marketplace_sync_jobs(connection_id, user_id);

create index if not exists marketplace_sync_job_chunks_user_idx
  on public.marketplace_sync_job_chunks(user_id);
