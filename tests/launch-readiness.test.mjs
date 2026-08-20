import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('validation evidence ledger is server-only, owner-bound and aggregate-only',async()=>{
  const sql=await read('supabase/migrations/20260821000500_launch_readiness_validation_evidence.sql');
  assert.match(sql,/marketplace_validation_evidence_owner_fk/i);
  assert.match(sql,/references public\.marketplace_connections\(id,user_id\) on delete cascade/i);
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/revoke all on public\.marketplace_validation_evidence from anon, authenticated/i);
  assert.match(sql,/grant select, insert, update, delete on public\.marketplace_validation_evidence to service_role/i);
  assert.match(sql,/Never store raw marketplace statements, credentials, customer data or order-level PII/i);
});

test('Trendyol reconciliation requires a closed seven-day period and server-side sync evidence',async()=>{
  const source=await read('supabase/functions/trendyol-reconciliation/index.ts');
  assert.match(source,/span!==7/);
  assert.match(source,/VALIDATION_PERIOD_MUST_BE_CLOSED_7_DAYS/);
  assert.match(source,/marketplace_sync_runs/);
  assert.match(source,/VALIDATION_SYNC_EVIDENCE_MISSING/);
  assert.match(source,/marketplace_daily_financials/);
  assert.match(source,/Math\.abs\(deltas\[field\]\)>0\.01/);
  assert.match(source,/status=matched\?'matched':'review_required'/);
  assert.doesNotMatch(source,/order_number|customer|api_secret|api_key/i);
});

test('launch readiness stays fail-closed until real-store, live billing and legal evidence exist',async()=>{
  const source=await read('supabase/functions/launch-readiness/index.ts');
  assert.match(source,/readyForAi:trendYolProven&&billingProven&&legalApproved/);
  assert.match(source,/config\.environment==='production'/);
  assert.match(source,/hasTransactionCompletion&&hasSubscriptionWebhook&&hasLiveSubscription/);
  assert.match(source,/marketplace_validation_evidence/);
  assert.match(source,/KARKALKAN_LEGAL_OPERATOR_NAME/);
  assert.match(source,/KARKALKAN_LEGAL_CONTACT_EMAIL/);
  assert.match(source,/KARKALKAN_LEGAL_APPROVED_AT/);
  assert.match(source,/KARKALKAN_LEGAL_PAGES_FINAL/);
  assert.match(source,/legalPagesFinal/);
});

test('readiness page is private-indexed, same-origin and exposes no privileged keys',async()=>{
  const [html,js,vercel,config]=await Promise.all([read('hazirlik.html'),read('hazirlik.js'),read('vercel.json'),read('supabase/config.toml')]);
  assert.match(html,/noindex,nofollow/);
  assert.match(js,/functions\/v1\/\$\{name\}/);
  assert.match(js,/PUBLISHABLE_KEY='sb_publishable_/);
  assert.doesNotMatch(js,/service_role|SUPABASE_SECRET_KEYS|PADDLE_API_KEY|PADDLE_WEBHOOK_SECRET/);
  assert.match(vercel,/"source": "\/hazirlik"/);
  assert.match(vercel,/"Cache-Control", "value": "no-store, max-age=0"/);
  assert.match(config,/\[functions\.launch-readiness\][\s\S]*verify_jwt = true/);
  assert.match(config,/\[functions\.trendyol-reconciliation\][\s\S]*verify_jwt = true/);
});
