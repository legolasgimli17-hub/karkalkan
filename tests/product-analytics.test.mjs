import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd();
const read=(path)=>readFile(join(root,path),'utf8');
const migration='supabase/migrations/20260819023000_product_analytics_daily.sql';
const fn='supabase/functions/product-analytics/index.ts';

test('product analytics schema is aggregate-only and inaccessible to browsers',async()=>{
  const sql=await read(migration);
  assert.match(sql,/create table public\.product_analytics_daily/i);
  assert.match(sql,/primary key \(day, event_name, stage, completed_steps, target_step\)/i);
  assert.match(sql,/alter table public\.product_analytics_daily enable row level security/i);
  assert.match(sql,/revoke all on table public\.product_analytics_daily from anon, authenticated/i);
  assert.doesNotMatch(sql,/\buser_id\b|email|seller_id|connection_id|product_id|amount|revenue|profit|iban|bank_account/i);
  assert.doesNotMatch(sql,/create policy|grant (select|insert|update|delete)/i);
});

test('product analytics ingestion requires auth, transaction pooling and bounded input',async()=>{
  const source=await read(fn),config=await read('supabase/config.toml');
  assert.match(source,/authenticate\(req\)/);
  assert.match(source,/KARKALKAN_DB_POOLER_URL/);
  assert.match(source,/createTransactionPool/);
  assert.match(source,/readJsonBody\(req,2_048\)/);
  assert.match(source,/consumeRateLimit\(sql,'product-analytics',auth\.user\.id,120,3600\)/);
  assert.match(config,/\[functions\.product-analytics\][\s\S]*?verify_jwt = true/);
  assert.doesNotMatch(source,/SUPABASE_DB_URL|service_role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test('analytics ingestion rejects unexpected fields and uses fixed low-cardinality enums',async()=>{
  const source=await read(fn);
  for(const field of ['event_name','stage','completed_steps','target_step'])assert.match(source,new RegExp(`'${field}'`));
  for(const event of ['onboarding_stage_viewed','onboarding_completed','onboarding_next_clicked','onboarding_step_clicked'])assert.match(source,new RegExp(`'${event}'`));
  for(const stage of ['none','store','data','cost','decision','complete'])assert.match(source,new RegExp(`'${stage}'`));
  assert.match(source,/Object\.keys\(body\)\.some\(key=>!ALLOWED_KEYS\.has\(key\)\)/);
  assert.match(source,/INVALID_ANALYTICS_EVENT/);
});

test('analytics writes an atomic daily aggregate without persisting authenticated identity',async()=>{
  const source=await read(fn);
  assert.match(source,/insert into public\.product_analytics_daily/);
  assert.match(source,/\(now\(\) at time zone 'UTC'\)::date/);
  assert.match(source,/on conflict \(day,event_name,stage,completed_steps,target_step\)/);
  assert.match(source,/event_count=public\.product_analytics_daily\.event_count\+1/);
  assert.doesNotMatch(source,/insert[^;]*auth\.user\.id/is);
  assert.doesNotMatch(source,/console\.(log|info|debug)|JSON\.stringify\(body\)/);
});
