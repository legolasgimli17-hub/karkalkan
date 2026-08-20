import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('default OpenAI model and Structured Outputs contract stay explicit',async()=>{
  const source=await read('supabase/functions/finance-ai/index.ts');
  assert.match(source,/const DEFAULT_MODEL='gpt-5\.6-luna'/);
  assert.match(source,/Verified against the OpenAI API documentation on 2026-08-21/);
  assert.match(source,/https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(source,/text:\{format:\{type:'json_schema',name:'karkalkan_finance_analysis',strict:true,schema:schema\(\)\}\}/);
  assert.match(source,/store:false/);
});

test('finance AI backend fails closed until launch readiness is true',async()=>{
  const source=await read('supabase/functions/finance-ai/index.ts');
  assert.match(source,/callInternal\(req,'launch-readiness',\{\}\)/);
  assert.match(source,/readiness\?\.readyForAi!==true/);
  assert.match(source,/error:'AI_NOT_READY'/);
  assert.match(source,/status.*AI_READINESS_CHECK_FAILED|AI_READINESS_CHECK_FAILED/s);
  const gate=source.indexOf("readiness=await callInternal(req,'launch-readiness',{})");
  const rateLimit=source.indexOf("consumeRateLimit(sql,'finance-ai'");
  const context=source.indexOf("callInternal(req,'dashboard-summary'");
  const modelCall=source.lastIndexOf('const model=await modelAnalysis');
  assert.ok(gate>-1&&rateLimit>-1&&context>-1&&modelCall>-1);
  assert.ok(gate<rateLimit,'readiness must be checked before consuming AI rate limit');
  assert.ok(gate<context,'readiness must be checked before finance context is assembled');
  assert.ok(gate<modelCall,'readiness must be checked before any model call');
});

test('launch readiness remains the single conjunction for AI activation',async()=>{
  const source=await read('supabase/functions/launch-readiness/index.ts');
  assert.match(source,/readyForAi:trendYolProven&&billingProven&&legalApproved/);
  assert.match(source,/trendyol:\{/);
  assert.match(source,/billing:\{/);
  assert.match(source,/legal:\{/);
});

test('finance AI frontend checks readiness and stays disabled on failure',async()=>{
  const client=await read('finance-ai.js');
  assert.match(client,/let aiReady=false/);
  assert.match(client,/let readinessChecked=false/);
  assert.match(client,/fn\('launch-readiness',\{method:'GET'\}\)/);
  assert.match(client,/data\?\.readyForAi===true/);
  assert.match(client,/if\(!readinessChecked\|\|!aiReady\)/);
  assert.match(client,/textarea id="financeAiQuestion" maxlength="500" disabled/);
  assert.match(client,/button id="financeAiAsk" type="submit" disabled/);
  assert.match(client,/AI hazırlık durumu güvenli şekilde doğrulanamadı; özellik kapalı tutuldu/);
  assert.match(client,/AI_NOT_READY/);
});
