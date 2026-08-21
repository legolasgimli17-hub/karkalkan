import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('weekly summary keeps authoritative finance math deterministic',async()=>{
  const [source,client,config]=await Promise.all([
    read('supabase/functions/weekly-finance-summary/index.ts'),
    read('weekly-finance.js'),
    read('supabase/config.toml')
  ]);
  assert.match(config,/\[functions\.weekly-finance-summary\][\s\S]*?verify_jwt = true/);
  assert.match(source,/authenticate\(req\)/);
  assert.match(source,/aggregateCashRows\(daily\)/);
  assert.match(source,/contributionAfterKnownCosts/);
  assert.match(source,/costCoverage: cost\.coverage/);
  assert.match(source,/last_7_closed_calendar_days_vs_previous_7_closed_calendar_days/);
  assert.match(source,/aiUsedForNumbers: false/);
  assert.doesNotMatch(source,/api\.openai\.com|OPENAI_API_KEY/);
  assert.match(client,/weekly-finance-summary/);
  assert.match(client,/Maliyet kapsamı eksik/);
  assert.doesNotMatch(client,/service_role|SUPABASE_SECRET_KEYS/i);
});

test('public health exposes current component state without fake SLA claims',async()=>{
  const [source,statusPage,statusClient,config]=await Promise.all([
    read('supabase/functions/public-health/index.ts'),
    read('durum.html'),
    read('status.js'),
    read('supabase/config.toml')
  ]);
  assert.match(config,/\[functions\.public-health\][\s\S]*?verify_jwt = false/);
  assert.match(source,/select 1 as ok/);
  assert.match(source,/does not claim historical uptime or an SLA/);
  assert.doesNotMatch(source,/user_id|marketplace_connections|decrypted_secret/);
  assert.match(statusClient,/\/functions\/v1\/public-health/);
  assert.match(statusClient,/\/api\/health/);
  assert.match(statusPage,/geçmiş[^<]*(?:uptime|erişilebilirlik)[^<]*SLA|SLA[^<]*geçmiş/i);
  assert.doesNotMatch(statusPage,/99\.9|99,9/);
});

test('public FAQ and buyer handoff keep unverified claims explicit',async()=>{
  const [faq,handoff,dependencies,readiness,runbook]=await Promise.all([
    read('sss.html'),
    read('docs/BUYER_HANDOFF.md'),
    read('docs/EXTERNAL_DEPENDENCIES.md'),
    read('docs/SALE_READINESS.md'),
    read('docs/OPERATIONS_RUNBOOK.md')
  ]);
  assert.match(faq,/AI kâr veya finans rakamlarını hesaplıyor mu/i);
  assert.match(faq,/gerçek satıcı mutabakatı tamamlandı/i);
  assert.match(handoff,/Secret değerleri bu repository/);
  assert.match(dependencies,/Paddle[\s\S]*?checkout[\s\S]*?webhook[\s\S]*?(?:subscription|abonelik)[\s\S]*?(?:portal|cancel)/i);
  assert.match(readiness,/Bilerek iddia edilmeyen/);
  assert.match(runbook,/SYNC_TOO_LARGE/);
});

test('workspace and clean routes expose the new trust surfaces',async()=>{
  const [workspace,vercel]=await Promise.all([read('workspace-analytics.js'),read('vercel.json')]);
  assert.match(workspace,/import\('\/weekly-finance\.js\?v=20260821'\)/);
  assert.match(vercel,/"source": "\/sss"[\s\S]*?"destination": "\/sss\.html"/);
  assert.match(vercel,/"source": "\/durum"[\s\S]*?"destination": "\/durum\.html"/);
  assert.match(vercel,/"source": "\/sss\.html"[\s\S]*?"destination": "\/sss"/);
  assert.match(vercel,/"source": "\/durum\.html"[\s\S]*?"destination": "\/durum"/);
});
