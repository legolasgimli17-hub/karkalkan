import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFile(join(root, path), 'utf8');

const foundationalMigrations = [
  'supabase/migrations/20260813155705_marketplace_v4_metadata.sql',
  'supabase/migrations/20260813162709_marketplace_v4_analytics_core.sql',
  'supabase/migrations/20260813163144_marketplace_v4_sync_locking.sql',
  'supabase/migrations/20260813164133_marketplace_v4_ownership_integrity.sql',
  'supabase/migrations/20260813183139_marketplace_sync_db_reconciliation_guard.sql',
  'supabase/migrations/20260813183453_product_cost_no_overlap.sql',
  'supabase/migrations/20260813183547_replace_cost_overlap_extension_with_trigger.sql'
];

const edgeFunctions = [
  'connection-health',
  'dashboard-summary',
  'marketplace-connections',
  'product-costs',
  'product-costs-bulk',
  'risk-alerts',
  'sync-history',
  'trendyol-cargo-sync',
  'trendyol-credentials',
  'trendyol-otherfinancials-sync',
  'trendyol-sync',
  'v4-auth',
  'v4-beta'
];

test('foundational Supabase migrations are version controlled', async () => {
  for (const migration of foundationalMigrations) await access(join(root, migration));
});

test('core financial tables are created with RLS and owner policies', async () => {
  const metadata = await read(foundationalMigrations[0]);
  const analytics = await read(foundationalMigrations[1]);

  for (const table of ['marketplace_connections', 'marketplace_sync_runs']) {
    assert.match(metadata, new RegExp(`create table public\\.${table}\\b`, 'i'));
    assert.match(metadata, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(metadata, new RegExp(`${table}_select_own`, 'i'));
  }

  for (const table of ['marketplace_daily_financials', 'marketplace_product_daily_metrics', 'marketplace_product_costs']) {
    assert.match(analytics, new RegExp(`create table public\\.${table}\\b`, 'i'));
    assert.match(analytics, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(analytics, new RegExp(`${table}_select_own`, 'i'));
  }

  for (const sql of [metadata, analytics]) {
    assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
    assert.match(sql, /revoke all on table/i);
    assert.match(sql, /grant select on table/i);
  }
});

test('ownership integrity and database guards are reproducible', async () => {
  const ownership = await read(foundationalMigrations[3]);
  const reconciliation = await read(foundationalMigrations[4]);
  const overlap = await read(foundationalMigrations[6]);

  assert.match(ownership, /unique \(id, user_id\)/i);
  for (const table of ['marketplace_sync_runs', 'marketplace_daily_financials', 'marketplace_product_daily_metrics', 'marketplace_product_costs']) {
    assert.match(ownership, new RegExp(`${table}_connection_owner_fkey`, 'i'));
  }
  assert.match(reconciliation, /SYNC_RECONCILIATION_FAILED/);
  assert.match(reconciliation, /trg_marketplace_sync_reconciliation/);
  assert.match(overlap, /PRODUCT_COST_PERIOD_OVERLAP/);
  assert.match(overlap, /trg_product_cost_no_overlap/);
});

test('all deployed Edge Function sources are present in the repository', async () => {
  for (const name of edgeFunctions) {
    await access(join(root, 'supabase', 'functions', name, 'index.ts'));
  }
});

test('Trendyol sync preserves audit visibility for unclassified adjustments', async () => {
  const sync = await read('supabase/functions/trendyol-sync/index.ts');
  const alerts = await read('v4-alerts.js');

  assert.match(sync, /function adjustmentType\(/);
  assert.match(sync, /unclassifiedAdjustmentRows/);
  assert.match(sync, /result_summary/);
  assert.match(alerts, /unclassifiedAdjustmentRows/);
  assert.match(alerts, /sınıflandırılamadı/);
});

test('public browser code does not contain privileged Supabase secrets', async () => {
  const browserFiles = [
    'app-core.js',
    'app-data.js',
    'app-bulk.js',
    'demo.js',
    'v4.js',
    'v4-security.js',
    'v4-enhance.js',
    'v4-alerts.js'
  ];
  const forbidden = [
    /SUPABASE_SERVICE_ROLE_KEY/,
    /service_role/i,
    /SUPABASE_DB_URL/,
    /api_secret\s*[:=]\s*['"][^'"]+/i
  ];

  for (const file of browserFiles) {
    const source = await read(file);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} contains a privileged secret marker`);
    }
  }
});

test('canonical seller route hides historical implementation filename', async () => {
  const vercel = await read('vercel.json');
  assert.match(vercel, /"source"\s*:\s*"\/uygulama"/);
  assert.match(vercel, /"destination"\s*:\s*"\/v4\.html"/);
  assert.match(vercel, /"source"\s*:\s*"\/v4\.html"/);
  assert.match(vercel, /"destination"\s*:\s*"\/uygulama"/);
});
