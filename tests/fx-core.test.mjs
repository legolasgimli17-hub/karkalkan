import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('FX import is authenticated, bounded and reuses deterministic core importer',async()=>{
  const [source,config]=await Promise.all([read('supabase/functions/marketplace-import-fx/index.ts'),read('supabase/config.toml')]);
  assert.match(config,/\[functions\.marketplace-import-fx\][\s\S]*?verify_jwt = true/);
  assert.match(source,/authenticate\(req\)/);
  assert.match(source,/MAX_ROWS=5000/);
  assert.match(source,/consumeRateLimit\(sql,'marketplace-import-fx',auth\.user\.id,10,3600\)/);
  assert.match(source,/\/functions\/v1\/marketplace-import/);
  assert.match(source,/connection_id:connectionId,rows:converted/);
});

test('ECB source and cross-rate rules preserve a common observation day',async()=>{
  const source=await read('supabase/functions/marketplace-import-fx/index.ts');
  assert.match(source,/https:\/\/data-api\.ecb\.europa\.eu/);
  assert.match(source,/D\.\$\{remote\.join\('\+'\)\}\.EUR\.SP00\.A/);
  assert.match(source,/format','csvdata'/);
  assert.match(source,/sourceDates\.keys\(\).*day<=target&&tryDates\.has\(day\)/s);
  assert.match(source,/rateToTry:tryRate\/source/);
  assert.match(source,/if\(cur==='TRY'\)return \{rateDate:target,rateToTry:1\}/);
});

test('original currency evidence is separated from TRY normalized finance',async()=>{
  const [migration,source]=await Promise.all([read('supabase/migrations/20260821003000_fx_reference_import_evidence.sql'),read('supabase/functions/marketplace-import-fx/index.ts')]);
  for(const table of ['fx_rates_daily','marketplace_fx_import_batches','marketplace_fx_import_daily']){
    assert.match(migration,new RegExp(`create table if not exists public\\.${table}`,'i'));
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`,'i'));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from anon, authenticated`,'i'));
  }
  assert.match(migration,/original_currency/);
  assert.match(migration,/transaction_rate_to_try/);
  assert.match(migration,/settlement_rate_to_try/);
  assert.match(migration,/fx_reference_variance_try/);
  assert.match(source,/source:'ECB_REFERENCE'/);
  assert.match(source,/referenceOnly:true/);
  assert.match(source,/baseCurrency:'TRY'/);
});

test('FX UI states reference-rate limitations and loads from workspace',async()=>{
  const [workspace,client]=await Promise.all([read('workspace-analytics.js'),read('fx-import.js')]);
  assert.match(workspace,/import\('\/fx-import\.js\?v=20260821'\)/);
  assert.match(client,/ECB referans oranları bilgi amaçlıdır/);
  assert.match(client,/gerçekleşmiş kuru değildir/);
  assert.match(client,/settlement_day/);
  assert.match(client,/marketplace-import-fx/);
  assert.doesNotMatch(client,/OPENAI_API_KEY|SUPABASE_SECRET_KEYS|service_role/i);
});
