import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('workspace loads the provider-specific Trendyol pipeline without relaxing other providers',async()=>{
  const analytics=await read('workspace-analytics.js');
  const pipeline=await read('trendyol-sync-pipeline.js');
  assert.match(analytics,/import\('\/trendyol-sync-pipeline\.js\?v=20260819'\)/);
  assert.match(pipeline,/connection\?\.marketplace !== 'trendyol'/);
  assert.match(pipeline,/stopImmediatePropagation\(\)/);
  assert.match(pipeline,/capture: true/);
});

test('Trendyol complete sync runs core finance before other financials and cargo evidence',async()=>{
  const [pipeline,orchestrator]=await Promise.all([
    read('trendyol-sync-pipeline.js'),
    read('supabase/functions/trendyol-resumable-sync/index.ts')
  ]);
  const core=orchestrator.indexOf("providerCall('trendyol-sync'");
  const auxiliary=orchestrator.indexOf("providerCall('trendyol-otherfinancials-sync'");
  assert.ok(core>0,'core Trendyol sync must be present in the resumable orchestrator');
  assert.ok(auxiliary>core,'other-financial stage must run only after core sync');
  assert.match(pipeline,/functionRequest\('trendyol-resumable-sync'/);
  assert.doesNotMatch(pipeline,/functionRequest\('trendyol-cargo-sync'/);
  assert.match(orchestrator,/cargoOk === true && auxiliary\.data\?\.orderMapOk === true/);
  assert.match(orchestrator,/AUXILIARY_INCOMPLETE/);
  assert.match(pipeline,/Trendyol tam senkron tamamlandı/);
});

test('validation protocol stays fail-honest until real seller evidence exists',async()=>{
  await access('docs/TRENDYOL_REAL_STORE_VALIDATION.md');
  const runbook=await read('docs/TRENDYOL_REAL_STORE_VALIDATION.md');
  const limitations=await read('KNOWN_LIMITATIONS.md');
  assert.match(runbook,/Status: \*\*not yet production-validated with a real seller store\*\*/i);
  assert.match(runbook,/settlements` and `otherfinancials` return separate financial records/i);
  assert.match(runbook,/closed seven-day slice/i);
  assert.match(runbook,/cargoOk = true/i);
  assert.match(runbook,/orderMapOk = true/i);
  assert.match(runbook,/no unexplained material financial delta remains/i);
  assert.match(runbook,/Do \*\*not\*\* define a universal percentage tolerance/i);
  assert.match(limitations,/Marketplace production validation — outstanding/i);
  assert.match(limitations,/complete end-to-end production validation with a real Trendyol seller account has not yet been recorded/i);
  assert.match(limitations,/TRENDYOL_REAL_STORE_VALIDATION\.md/);
  assert.match(limitations,/Do not change the public provider state[\s\S]*to a verified state until the sanitized reconciliation record/i);
});

test('validation evidence rules forbid public credentials and raw seller/customer records',async()=>{
  const runbook=await read('docs/TRENDYOL_REAL_STORE_VALIDATION.md');
  assert.match(runbook,/never paste credentials into issues, PRs, screenshots, chat transcripts/i);
  assert.match(runbook,/Do not publish raw orders, customer data, API responses or credentials/i);
  assert.match(runbook,/sanitized validation record/i);
});