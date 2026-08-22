import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');

test('resumable sync state is server-only, owner-bound and chunked', async () => {
  const migration = await read('supabase/migrations/20260822000100_trendyol_resumable_sync_jobs.sql');
  for (const table of ['marketplace_sync_jobs', 'marketplace_sync_job_chunks']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'));
  }
  assert.match(migration, /foreign key \(connection_id,user_id\)[\s\S]*?marketplace_connections\(id,user_id\)/i);
  assert.match(migration, /marketplace_sync_jobs_one_active_per_connection_idx/);
  assert.match(migration, /status in \('pending','running','retry_wait'\)/i);
  assert.match(migration, /core_summary jsonb/);
  assert.match(migration, /auxiliary_summary jsonb/);
});

test('shared range resolver preserves 7 and 30 day behavior while bounding explicit chunks', async () => {
  const source = await read('supabase/functions/_shared/sync-range.ts');
  assert.match(source, /allowedDays \|\| \[7, 30\]/);
  assert.match(source, /maxExplicitDays/);
  assert.match(source, /start_day/);
  assert.match(source, /end_day/);
  assert.match(source, /span > maxExplicitDays/);
  assert.match(source, /timeZone: 'Europe\/Istanbul'/);
});

test('Trendyol core and auxiliary functions accept only bounded explicit ranges through shared resolver', async () => {
  const [core, auxiliary] = await Promise.all([
    read('supabase/functions/trendyol-sync/index.ts'),
    read('supabase/functions/trendyol-otherfinancials-sync/index.ts')
  ]);
  for (const source of [core, auxiliary]) {
    assert.match(source, /_shared\/sync-range\.ts/);
    assert.match(source, /resolveSyncRange\(body,\s*\{\s*allowedDays:\s*\[7,\s*30\],\s*maxExplicitDays:\s*3\s*\}\)/s);
    assert.match(source, /rangeDays:\s*range\.rangeDays/);
  }
  assert.match(auxiliary, /delete from public\.marketplace_order_product_map[\s\S]*?order_day between \$\{startDay\}::date and \$\{endDay\}::date/);
  assert.doesNotMatch(auxiliary, /delete from public\.marketplace_order_product_map where connection_id=\$\{connectionId\}::uuid and user_id=\$\{user\.id\}::uuid`;/);
});

test('orchestrator processes one bounded chunk per request and only completes after core plus auxiliary evidence', async () => {
  const [source, config] = await Promise.all([
    read('supabase/functions/trendyol-resumable-sync/index.ts'),
    read('supabase/config.toml')
  ]);
  assert.match(config, /\[functions\.trendyol-resumable-sync\][\s\S]*?verify_jwt = true/);
  assert.match(source, /const CHUNK_DAYS = 3/);
  assert.match(source, /const MAX_ATTEMPTS = 4/);
  assert.match(source, /providerCall\('trendyol-sync'/);
  assert.match(source, /providerCall\('trendyol-otherfinancials-sync'/);
  assert.match(source, /start_day: running\.range_start, end_day: running\.range_end/);
  assert.match(source, /cargoOk === true && auxiliary\.data\?\.orderMapOk === true/);
  assert.match(source, /marketplace_sync_runs/);
  assert.match(source, /trendyol-resumable-v1/);
  assert.match(source, /lease_expires_at/);
  assert.match(source, /retry_wait/);
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEYS|service_role/i);
});

test('browser Trendyol pipeline resumes persisted jobs and no longer invokes long provider stages directly', async () => {
  const client = await read('trendyol-sync-pipeline.js');
  assert.match(client, /trendyol-resumable-sync/);
  assert.match(client, /completedChunks/);
  assert.match(client, /retryAfterSeconds/);
  assert.doesNotMatch(client, /functionRequest\('trendyol-sync'/);
  assert.doesNotMatch(client, /functionRequest\('trendyol-otherfinancials-sync'/);
  assert.doesNotMatch(client, /service_role|SUPABASE_SECRET_KEYS/i);
});
