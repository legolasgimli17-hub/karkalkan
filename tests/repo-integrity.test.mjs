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
const liveSignalMigration = 'supabase/migrations/20260816180000_add_live_order_signal_layer.sql';
const operatingExpenseMigration = 'supabase/migrations/20260816183000_add_operating_expense_ledger.sql';

const edgeFunctions = [
  'connection-health','dashboard-summary','marketplace-connections','product-costs','product-costs-bulk','risk-alerts','sync-history',
  'trendyol-cargo-sync','trendyol-credentials','trendyol-otherfinancials-sync','trendyol-sync','v4-auth','v4-beta',
  'webhook-manager','order-events','live-overview','decision-center','operating-expenses','portfolio-summary'
];

test('foundational Supabase migrations are version controlled', async () => {
  for (const migration of foundationalMigrations) await access(join(root, migration));
  await access(join(root, liveSignalMigration));
  await access(join(root, operatingExpenseMigration));
});

test('core financial tables are created with RLS and owner policies', async () => {
  const metadata = await read(foundationalMigrations[0]);
  const analytics = await read(foundationalMigrations[1]);
  for (const table of ['marketplace_connections','marketplace_sync_runs']) {
    assert.match(metadata,new RegExp(`create table public\\.${table}\\b`,'i'));
    assert.match(metadata,new RegExp(`alter table public\\.${table} enable row level security`,'i'));
    assert.match(metadata,new RegExp(`${table}_select_own`,'i'));
  }
  for (const table of ['marketplace_daily_financials','marketplace_product_daily_metrics','marketplace_product_costs']) {
    assert.match(analytics,new RegExp(`create table public\\.${table}\\b`,'i'));
    assert.match(analytics,new RegExp(`alter table public\\.${table} enable row level security`,'i'));
    assert.match(analytics,new RegExp(`${table}_select_own`,'i'));
  }
  for (const sql of [metadata,analytics]) {
    assert.match(sql,/using \(\(select auth\.uid\(\)\) = user_id\)/i);
    assert.match(sql,/revoke all on table/i);
    assert.match(sql,/grant select on table/i);
  }
});

test('live order signal tables use owner isolation and least-privilege browser grants', async () => {
  const sql=await read(liveSignalMigration);
  for(const table of ['marketplace_webhooks','marketplace_order_events','marketplace_live_orders']){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}\\b`,'i'));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`,'i'));
    assert.match(sql,new RegExp(`${table}_select_own`,'i'));
    assert.match(sql,new RegExp(`revoke all on table public\\.${table} from anon, authenticated`,'i'));
    assert.match(sql,new RegExp(`grant select on table public\\.${table} to authenticated`,'i'));
  }
  assert.match(sql,/foreign key \(connection_id,user_id\) references public\.marketplace_connections\(id,user_id\)/i);
  assert.match(sql,/using \(\(select auth\.uid\(\)\)=user_id\)/i);
});

test('operating expense ledger is owner isolated and browser read-only', async () => {
  const sql=await read(operatingExpenseMigration);
  assert.match(sql,/create table if not exists public\.marketplace_operating_expenses/i);
  assert.match(sql,/marketplace_operating_expenses_connection_owner_fkey/i);
  assert.match(sql,/foreign key \(connection_id,user_id\) references public\.marketplace_connections\(id,user_id\)/i);
  assert.match(sql,/alter table public\.marketplace_operating_expenses enable row level security/i);
  assert.match(sql,/revoke all on table public\.marketplace_operating_expenses from anon, authenticated/i);
  assert.match(sql,/grant select on table public\.marketplace_operating_expenses to authenticated/i);
  assert.match(sql,/marketplace_operating_expenses_select_own/i);
  assert.match(sql,/using \(\(select auth\.uid\(\)\)=user_id\)/i);
});

test('ownership integrity and database guards are reproducible', async () => {
  const ownership=await read(foundationalMigrations[3]),reconciliation=await read(foundationalMigrations[4]),overlap=await read(foundationalMigrations[6]);
  assert.match(ownership,/unique \(id, user_id\)/i);
  for(const table of ['marketplace_sync_runs','marketplace_daily_financials','marketplace_product_daily_metrics','marketplace_product_costs'])assert.match(ownership,new RegExp(`${table}_connection_owner_fkey`,'i'));
  assert.match(reconciliation,/SYNC_RECONCILIATION_FAILED/);assert.match(reconciliation,/trg_marketplace_sync_reconciliation/);
  assert.match(overlap,/PRODUCT_COST_PERIOD_OVERLAP/);assert.match(overlap,/trg_product_cost_no_overlap/);
});

test('all deployed Edge Function sources are present in the repository', async () => {
  for(const name of edgeFunctions)await access(join(root,'supabase','functions',name,'index.ts'));
  assert.equal(edgeFunctions.length,19);
});

test('external order callback is authenticated independently of Supabase JWT', async () => {
  const receiver=await read('supabase/functions/order-events/index.ts'),manager=await read('supabase/functions/webhook-manager/index.ts'),config=await read('supabase/config.toml');
  assert.match(receiver,/x-api-key/i);assert.match(receiver,/SHA-256/i);assert.match(receiver,/secret_hash/);assert.match(receiver,/event_fingerprint/);
  assert.match(receiver,/on conflict \(event_fingerprint\) do nothing/i);assert.match(receiver,/excluded\.event_at>=public\.marketplace_live_orders\.event_at/i);
  assert.doesNotMatch(receiver,/customerFirstName|customerLastName|shipmentAddress|invoiceAddress|phone/i);
  assert.match(manager,/authenticationType:'API_KEY'/);assert.match(manager,/subscribedStatuses:\[\]/);assert.match(manager,/order-events\?c=/);assert.match(manager,/secretHash=await sha256\(hookSecret\)/);
  assert.match(config,/\[functions\.order-events\][\s\S]*?verify_jwt = false/);assert.match(config,/\[functions\.webhook-manager\][\s\S]*?verify_jwt = true/);assert.match(config,/\[functions\.live-overview\][\s\S]*?verify_jwt = true/);
});

test('decision center is explainable rather than an opaque score', async () => {
  const source=await read('supabase/functions/decision-center/index.ts'),config=await read('supabase/config.toml'),ui=await read('vnext.js');
  for(const signal of ['salesEvidence','returnEvidence','costCoverage','cargoCoverage','classification','freshness'])assert.match(source,new RegExp(signal));
  assert.match(source,/explainable_score_v1/);assert.match(source,/moneyLeakRadar/);assert.match(source,/Maliyet kör noktası/);assert.match(source,/Kargo dağıtım boşluğu/);
  assert.match(config,/\[functions\.decision-center\][\s\S]*?verify_jwt = true/);
  assert.match(ui,/Şeffaf mağaza skoru/);assert.match(ui,/Para kaçağı radarı/);assert.match(ui,/Skor ağırlığı/);
});

test('portfolio allocates operating expenses explicitly and avoids accounting net-profit claims', async () => {
  const portfolio=await read('supabase/functions/portfolio-summary/index.ts');
  const expenses=await read('supabase/functions/operating-expenses/index.ts');
  const config=await read('supabase/config.toml');
  const ui=await read('vnext-ops.js');
  assert.match(portfolio,/function overlapShare\(/);
  assert.match(portfolio,/afterOperatingExpenses/);
  assert.match(portfolio,/muhasebe net kârı değildir/i);
  assert.match(expenses,/marketplace_operating_expenses/);
  assert.match(expenses,/connection_id=\$\{connectionId\}::uuid and user_id=\$\{user\.id\}::uuid/);
  assert.match(config,/\[functions\.operating-expenses\][\s\S]*?verify_jwt = true/);
  assert.match(config,/\[functions\.portfolio-summary\][\s\S]*?verify_jwt = true/);
  assert.match(ui,/İşletme Giderleri/);
  assert.match(ui,/Mağaza Portföyü/);
  assert.match(ui,/İşletme sonrası görünüm/);
});

test('Trendyol sync preserves audit visibility for unclassified adjustments', async () => {
  const sync=await read('supabase/functions/trendyol-sync/index.ts'),alerts=await read('v4-alerts.js');
  assert.match(sync,/function adjustmentType\(/);assert.match(sync,/unclassifiedAdjustmentRows/);assert.match(sync,/result_summary/);
  assert.match(alerts,/unclassifiedAdjustmentRows/);assert.match(alerts,/sınıflandırılamadı/);
});

test('vNext distinct layers load after the stable core', async () => {
  const loader=await read('v4-alerts.js'),next=await read('vnext.js'),css=await read('vnext.css'),ops=await read('vnext-ops.js'),opsCss=await read('vnext-ops.css');
  assert.match(loader,/\/vnext\.css/);assert.match(loader,/\/vnext\.js/);assert.match(loader,/\/vnext-ops\.css/);assert.match(loader,/\/vnext-ops\.js/);
  assert.match(next,/Hızlı sipariş sinyali, sonradan doğrulanan finans gerçeği/);assert.match(next,/Rakamın dayanağı|Şeffaf mağaza skoru/);assert.match(next,/Para köprüsü/);assert.match(next,/Canlı Siparişler/);
  assert.match(css,/--kk-copper:#f2a65a/);assert.match(css,/--kk-ice:#79c7ff/);
  assert.match(ops,/İşletme Giderleri/);assert.match(ops,/Mağaza Portföyü/);assert.match(opsCss,/\.kk-ops-grid/);
});

test('public browser code does not contain privileged Supabase secrets', async () => {
  const browserFiles=['app-core.js','app-data.js','app-bulk.js','demo.js','v4.js','v4-security.js','v4-enhance.js','v4-alerts.js','vnext.js','vnext-ops.js'];
  const forbidden=[/SUPABASE_SERVICE_ROLE_KEY/,/service_role/i,/SUPABASE_DB_URL/,/api_secret\s*[:=]\s*['"][^'"]+/i];
  for(const file of browserFiles){const source=await read(file);for(const pattern of forbidden)assert.doesNotMatch(source,pattern,`${file} contains a privileged secret marker`)}
});

test('canonical seller route hides historical implementation filename', async () => {
  const vercel=await read('vercel.json');assert.match(vercel,/"source"\s*:\s*"\/uygulama"/);assert.match(vercel,/"destination"\s*:\s*"\/v4\.html"/);assert.match(vercel,/"source"\s*:\s*"\/v4\.html"/);assert.match(vercel,/"destination"\s*:\s*"\/uygulama"/);
});
