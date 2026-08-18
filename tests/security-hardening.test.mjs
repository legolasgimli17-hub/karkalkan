import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd();
const read=(path)=>readFile(join(root,path),'utf8');

test('all inbound request bodies use the bounded shared reader',async()=>{
  const rootDir=join(root,'supabase/functions');
  const names=await readdir(rootDir,{withFileTypes:true});
  for(const entry of names){
    if(!entry.isDirectory()||entry.name==='_shared')continue;
    const path=join(rootDir,entry.name,'index.ts');
    let source='';
    try{source=await readFile(path,'utf8')}catch{continue}
    assert.doesNotMatch(source,/\breq\.json\s*\(/,`${entry.name} parses an unbounded request body`);
  }
  const shared=await read('supabase/functions/_shared/request-security.ts');
  assert.match(shared,/req\.body\.getReader\(\)/);
  assert.match(shared,/PAYLOAD_TOO_LARGE/);
  assert.match(shared,/UNSUPPORTED_MEDIA_TYPE/);
  assert.match(shared,/content-length/i);
});

test('server-only abuse buckets are hashed, RLS protected and unavailable to browser roles',async()=>{
  const migration=await read('supabase/migrations/20260818170055_security_hardening.sql');
  const shared=await read('supabase/functions/_shared/request-security.ts');
  assert.match(migration,/create table if not exists public\.edge_rate_limits/i);
  assert.match(migration,/alter table public\.edge_rate_limits enable row level security/i);
  assert.match(migration,/revoke all on table public\.edge_rate_limits from public, anon, authenticated/i);
  assert.match(migration,/edge_rate_limits_deny_browser/i);
  assert.match(shared,/crypto\.subtle\.digest\('SHA-256'/);
  assert.doesNotMatch(migration,/ip_address|authorization|access_token|request_body/i);
});

test('unauthenticated callbacks have independent verification, bounds and replay controls',async()=>{
  const [orders,billing,amazon,config]=await Promise.all([
    read('supabase/functions/order-events/index.ts'),
    read('supabase/functions/billing-webhook/index.ts'),
    read('supabase/functions/amazon-auth-callback/index.ts'),
    read('supabase/config.toml'),
  ]);
  assert.match(config,/\[functions\.order-events\][\s\S]*?verify_jwt = false/);
  assert.match(orders,/readJsonBody\(req,MAX_BODY_BYTES\)/);
  assert.match(orders,/timingSafeEqualSha256/);
  assert.match(orders,/consumeRateLimit/);
  assert.match(orders,/sql\.begin/);
  assert.match(billing,/readTextBody\(req,MAX_BODY_BYTES,true\)/);
  assert.match(billing,/timingSafeHexEqual/);
  assert.match(billing,/EVENT_ID_CONFLICT/);
  assert.match(amazon,/consumed_at=now\(\)/);
  assert.match(amazon,/AMAZON_OAUTH_SELLER_MISMATCH/);
  assert.match(amazon,/expected_seller_id/);
});

test('credentialed provider requests reject redirects',async()=>{
  for(const name of ['trendyol-sync','trendyol-cargo-sync','trendyol-otherfinancials-sync','hepsiburada-sync','n11-sync','amazon-sync','amazon-auth-callback','webhook-manager']){
    const source=await read(`supabase/functions/${name}/index.ts`);
    assert.match(source,/redirect\s*:\s*["']error["']/,`${name} must reject redirects`);
  }
  const billing=await read('supabase/functions/_shared/billing.ts');
  assert.match(billing,/redirect\s*:\s*['"]error['"]/);
});

test('monitoring never receives original exception objects or request data',async()=>{
  const source=await read('supabase/functions/_shared/observability.ts');
  assert.match(source,/KarkalkanSafeError/);
  assert.match(source,/Sentry\.captureException\(safeError\)/);
  assert.doesNotMatch(source,/Sentry\.captureException\(error\)/);
  assert.match(source,/sendDefaultPii:false/);
  assert.match(source,/defaultIntegrations:false/);
});

test('billing entitlement and connection deletion are server authoritative',async()=>{
  const [billing,connections]=await Promise.all([
    read('supabase/functions/billing-webhook/index.ts'),
    read('supabase/functions/marketplace-connections/index.ts'),
  ]);
  assert.match(billing,/configuredPrice===priceId/);
  assert.match(billing,/const planKey=isPlanKey\(reversePlan\)\?reversePlan:'free'/);
  assert.doesNotMatch(billing,/custom_data\?\.plan/);
  assert.match(connections,/sql\.begin/);
  assert.match(connections,/delete from vault\.secrets/);
  assert.match(connections,/user_id=\$\{user\.id\}/);
});

test('browser and CI security controls are explicit and immutable',async()=>{
  const [vercel,verify,codeql]=await Promise.all([
    read('vercel.json'),
    read('.github/workflows/verify.yml'),
    read('.github/workflows/codeql.yml'),
  ]);
  for(const header of ['Strict-Transport-Security','Content-Security-Policy','Origin-Agent-Cluster','Referrer-Policy','X-Permitted-Cross-Domain-Policies'])assert.match(vercel,new RegExp(header));
  assert.match(vercel,/"source": "\/uygulama"[\s\S]*?"Cache-Control", "value": "no-store, max-age=0"/);
  assert.doesNotMatch(verify,/uses:\s+[^\s]+@v\d+/);
  assert.doesNotMatch(codeql,/uses:\s+[^\s]+@v\d+/);
  assert.match(codeql,/security-extended/);
});
