import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {join} from 'node:path';

const root=process.cwd();
const read=(path)=>readFile(join(root,path),'utf8');

test('premium visual layer is loaded after the functional vNext layer',async()=>{
  for(const file of ['vnext-visual.js','vnext-visual.css'])await access(join(root,file));
  const loader=await read('v4-alerts.js');
  assert.match(loader,/\/vnext-visual\.css/);
  assert.match(loader,/\/vnext-visual\.js/);
  assert.match(loader,/script\.addEventListener\('load'/);
});

test('visual layer does not own finance or authentication behavior',async()=>{
  const source=await read('vnext-visual.js');
  for(const forbidden of [/functionRequest\s*=/,/refreshConnectionData\s*=/,/renderDashboard\s*=/,/SUPABASE_SERVICE_ROLE_KEY/,/service_role/i,/api_secret/i]){
    assert.doesNotMatch(source,forbidden);
  }
  assert.match(source,/already-rendered, real dashboard\s+data/i);
  assert.match(source,/MutationObserver/);
});

test('visual language is KârKalkan-specific and data-driven',async()=>{
  const js=await read('vnext-visual.js');
  const css=await read('vnext-visual.css');
  assert.match(js,/kkConfidenceRing/);
  assert.match(js,/kkEvidenceRadar/);
  assert.match(js,/querySelectorAll\('polyline'\)/);
  assert.match(js,/Konum görseli dekoratiftir/);
  assert.match(css,/var\(--kk-copper\)/);
  assert.match(css,/var\(--kk-ice\)/);
  assert.match(css,/\.kk-auth-orbit/);
  assert.match(css,/\.kk-confidence-ring/);
  assert.match(css,/\.kk-leak-rings/);
});
