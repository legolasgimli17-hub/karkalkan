import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('workspace loads a dedicated evidence-bound finance analyst without relaxing CSP',async()=>{
  const [workspace,client,css]=await Promise.all([read('workspace-analytics.js'),read('finance-ai.js'),read('finance-ai.css')]);
  assert.match(workspace,/import\('\/finance-ai\.js\?v=20260821'\)/);
  assert.match(client,/Kanıta bağlı finans asistanı/);
  assert.match(client,/a\[href="#financeAi"\]/);
  assert.match(css,/\.finance-ai-actions-title/);
  assert.doesNotMatch(client,/style\s*=/i);
  assert.doesNotMatch(client,/OPENAI_API_KEY|SUPABASE_SECRET_KEYS|service_role/i);
});

test('finance AI is JWT protected, bounded and database rate limited',async()=>{
  const [source,config]=await Promise.all([read('supabase/functions/finance-ai/index.ts'),read('supabase/config.toml')]);
  assert.match(config,/\[functions\.finance-ai\][\s\S]*?verify_jwt = true/);
  assert.match(source,/authenticate\(req\)/);
  assert.match(source,/MAX_QUESTION=500/);
  assert.match(source,/ALLOWED_DAYS=new Set\(\[7,30\]\)/);
  assert.match(source,/consumeRateLimit\(sql,'finance-ai',auth\.user\.id,30,3600\)/);
  assert.match(source,/AI_INPUT_MAY_CONTAIN_PERSONAL_DATA/);
});

test('model never becomes the finance calculation authority',async()=>{
  const source=await read('supabase/functions/finance-ai/index.ts');
  assert.match(source,/callInternal\(req,'dashboard-summary'/);
  assert.match(source,/callInternal\(req,'decision-center'/);
  assert.match(source,/You are NOT the calculation engine/);
  assert.match(source,/Never calculate or invent financial numbers/);
  assert.match(source,/deterministicNumbers:true/);
  assert.match(source,/autonomousFinancialActions:false/);
});

test('AI context is minimized and no raw commerce/customer secrets are selected for the model',async()=>{
  const source=await read('supabase/functions/finance-ai/index.ts');
  assert.match(source,/rawOrdersSentToModel:false/);
  assert.match(source,/customerDataSentToModel:false/);
  assert.match(source,/credentialsSentToModel:false/);
  assert.match(source,/const context=\{question,confidenceScore:confidence,evidence\}/);
  assert.doesNotMatch(source,/from\(['"]marketplace_order_events['"]\)/);
  assert.doesNotMatch(source,/from\(['"]marketplace_live_orders['"]\)/);
  assert.doesNotMatch(source,/from\(['"]bank_statement_transactions['"]\)/);
  assert.doesNotMatch(source,/api_secret|oauth_token|refresh_token|customer_email|customer_phone/i);
});

test('OpenAI call requests no response storage and invalid evidence citations fail closed',async()=>{
  const source=await read('supabase/functions/finance-ai/index.ts');
  assert.match(source,/https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(source,/store:false/);
  assert.match(source,/type:'json_schema'/);
  assert.match(source,/strict:true/);
  assert.match(source,/allowed\.has\(String\(id\)\)/);
  assert.match(source,/AI_EVIDENCE_VALIDATION_FAILED/);
  assert.match(source,/mode:'evidence_only'/);
  assert.match(source,/if\(!apiKey\)return \{analysis:fallback,aiConfigured:false/);
});

test('low-confidence behavior prefers data remediation over commercial action',async()=>{
  const source=await read('supabase/functions/finance-ai/index.ts');
  assert.match(source,/if\(score<70\).*Önce veri kapsamını güçlendir/s);
  assert.match(source,/If confidenceScore is below 70, prioritize data-quality remediation over commercial recommendations/);
});

test('legal drafts disclose AI purpose, minimization, automated-decision boundary and transfer gate',async()=>{
  const [kvkk,privacy,terms,gate,thirdParty]=await Promise.all([
    read('kvkk.html'),read('gizlilik.html'),read('kullanim-kosullari.html'),read('docs/LEGAL_GO_LIVE.md'),read('THIRD_PARTY.md')
  ]);
  assert.match(kvkk,/AI analiz kutusuna yazdığı kısa finans sorusu/i);
  assert.match(kvkk,/azaltılmış\/agrega kanıt paketi/i);
  assert.match(kvkk,/münhasıran otomatik sistemler/i);
  assert.match(kvkk,/KVKK m\.9/i);
  assert.match(kvkk,/GERÇEK KİŞİ \/ TÜZEL KİŞİ UNVANI/);
  assert.match(privacy,/AI Finans Analisti nasıl çalışır/i);
  assert.match(privacy,/Ham sipariş satırları, müşteri kayıtları, banka açıklamaları/i);
  assert.match(privacy,/store:false/);
  assert.match(terms,/Kanıta bağlı AI Finans Analisti/i);
  assert.match(terms,/geri döndürülemez finansal işlem/i);
  assert.match(gate,/AI provider activation review/i);
  assert.match(gate,/Article 9/i);
  assert.match(thirdParty,/OpenAI Responses API/i);
  assert.match(thirdParty,/deterministic evidence-only fallback/i);
});

test('benchmark and architecture documents are checked in',async()=>{
  await Promise.all([access('docs/GLOBAL_AI_BENCHMARK_2026.md'),access('docs/AI_ARCHITECTURE.md')]);
  const [benchmark,architecture,env]=await Promise.all([read('docs/GLOBAL_AI_BENCHMARK_2026.md'),read('docs/AI_ARCHITECTURE.md'),read('.env.example')]);
  for(const product of ['Finaloop','Triple Whale','A2X','Link My Books'])assert.match(benchmark,new RegExp(product,'i'));
  assert.match(benchmark,/evidence-bound finance AI/i);
  assert.match(architecture,/deterministic finance functions remain authoritative/i);
  assert.match(env,/OPENAI_API_KEY=REPLACE_ME/);
  assert.match(env,/KARKALKAN_AI_MODEL=gpt-5\.6-luna/);
});
