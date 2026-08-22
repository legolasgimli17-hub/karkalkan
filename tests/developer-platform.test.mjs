import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('developer platform tables are server-only and owner-bound',async()=>{
  const migration=await read('supabase/migrations/20260822000300_developer_platform.sql');
  for(const table of ['developer_api_keys','developer_webhooks','developer_webhook_deliveries']){
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`,'i'));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from anon, authenticated`,'i'));
  }
  assert.match(migration,/user_id uuid not null references auth\.users\(id\) on delete cascade/i);
  assert.match(migration,/key_hash text not null unique/i);
  assert.match(migration,/key_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(migration,/vault_secret_id uuid not null unique/i);
  assert.match(migration,/unique\(webhook_id, event_id\)/i);
});

test('API key manager returns a secret once but stores only SHA-256 hash',async()=>{
  const source=await read('supabase/functions/developer-api-keys/index.ts');
  assert.match(source,/kk_live_/);
  assert.match(source,/crypto\.subtle\.digest\('SHA-256'/);
  assert.match(source,/insert into public\.developer_api_keys\(user_id,name,key_prefix,key_hash,scopes,expires_at\)/i);
  assert.match(source,/secret,warning:/);
  assert.doesNotMatch(source,/insert into public\.developer_api_keys[\s\S]*?secret[,)]/i);
  assert.match(source,/revoked_at=coalesce\(revoked_at,now\(\)\)/i);
  assert.match(source,/MAX_ACTIVE_KEYS=5/);
});

test('Public API v1 is read-only, scoped and excludes seller/customer credentials',async()=>{
  const [source,config]=await Promise.all([
    read('supabase/functions/public-api-v1/index.ts'),
    read('supabase/config.toml')
  ]);
  assert.match(config,/\[functions\.public-api-v1\][\s\S]*?verify_jwt = false/);
  assert.match(source,/startsWith\('Bearer kk_live_'\)/);
  assert.match(source,/finance:read/);
  assert.match(source,/products:read/);
  assert.match(source,/connections:read/);
  assert.match(source,/consumeRateLimit\(sql,'public-api-v1'/);
  assert.match(source,/piiIncluded:false/);
  assert.doesNotMatch(source,/external_seller_id|api_secret|decrypted_secret|customer_email|customer_name|iban/i);
  assert.doesNotMatch(source,/\b(insert|delete|upsert)\s+into\s+public\.marketplace_/i);
});

test('outbound webhooks are Vault-backed, HMAC signed and do not follow redirects',async()=>{
  const [manager,delivery,config]=await Promise.all([
    read('supabase/functions/developer-webhooks/index.ts'),
    read('supabase/functions/_shared/outbound-webhooks.ts'),
    read('supabase/config.toml')
  ]);
  assert.match(config,/\[functions\.developer-webhooks\][\s\S]*?verify_jwt = true/);
  assert.match(manager,/vault\.create_secret/);
  assert.match(manager,/signingSecret:secret/);
  assert.match(delivery,/HMAC/);
  assert.match(delivery,/X-Karkalkan-Signature/);
  assert.match(delivery,/X-Karkalkan-Timestamp/);
  assert.match(delivery,/redirect:'error'/);
  assert.match(delivery,/AbortSignal\.timeout\(8_000\)/);
  assert.match(delivery,/host==='localhost'/);
  assert.match(delivery,/host\.endsWith\('\.internal'\)/);
  assert.match(delivery,/isIpv4\(host\)/);
  assert.doesNotMatch(delivery,/console\.log\([^\n]*secret/i);
});

test('resumable Trendyol emits a non-blocking signed completion event',async()=>{
  const source=await read('supabase/functions/trendyol-resumable-sync/index.ts');
  assert.match(source,/_shared\/outbound-webhooks\.ts/);
  assert.match(source,/deliverOutboundEvent\(sql, auth\.user\.id, 'sync\.completed'/);
  assert.match(source,/marketplace: 'trendyol'/);
  assert.match(source,/importedTransactions/);
  assert.match(source,/\.catch\(\(\) => \{\}\)/);
});

test('CORS source is transferable and contains no personal Vercel team hostname',async()=>{
  const [edgeAuth,core,env]=await Promise.all([
    read('supabase/functions/_shared/edge-auth.ts'),
    read('supabase/functions/trendyol-sync/index.ts'),
    read('.env.example')
  ]);
  for(const source of [edgeAuth,core,env])assert.doesNotMatch(source,/krgzabdullah22-8562s-projects\.vercel\.app/i);
  assert.match(edgeAuth,/KARKALKAN_APP_ORIGIN/);
  assert.match(edgeAuth,/KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX/);
  assert.match(core,/KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX/);
  assert.match(env,/KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX=/);
});
