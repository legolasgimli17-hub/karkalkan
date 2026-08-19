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
  const pipeline=await read('trendyol-sync-pipeline.js');
  const core=pipeline.indexOf("functionRequest('trendyol-sync'");
  const auxiliary=pipeline.indexOf("functionRequest('trendyol-otherfinancials-sync'");
  assert.ok(core>0,'core Trendyol sync must be present');
  assert.ok(auxiliary>core,'other-financial stage must run only after core sync');
  assert.doesNotMatch(pipeline,/functionRequest\('trendyol-cargo-sync'/);
  assert.match(pipeline,/auxiliary\?\.cargoOk !== true \|\| auxiliary\?\.orderMapOk !== true/);
  assert.match(pipeline,/Finans kapsamını tam saymadan yeniden deneyin/);
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
  assert.match(limitations,/TRENDYOL_REAL_STORE_VALIDATION\.md/);
  assert.doesNotMatch(limitations,/Trendyol[^\n]*production[- ]validated/i);
});

test('validation evidence rules forbid public credentials and raw seller/customer records',async()=>{
  const runbook=await read('docs/TRENDYOL_REAL_STORE_VALIDATION.md');
  assert.match(runbook,/never paste credentials into issues, PRs, screenshots, chat transcripts/i);
  assert.match(runbook,/Do not publish raw orders, customer data, API responses or credentials/i);
  assert.match(runbook,/sanitized validation record/i);
});
