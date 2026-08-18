import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd();
const read=(path)=>readFile(join(root,path),'utf8');

test('authenticated workspace loads the guided onboarding assets after the core modules',async()=>{
  const html=await read('v4.html');
  assert.match(html,/onboarding\.css\?v=20260818/);
  assert.match(html,/bank-reconciliation\.js\?v=20260819[\s\S]*onboarding\.js\?v=20260818/);
});

test('onboarding completion is derived from real store, sync, cost and dashboard state',async()=>{
  const source=await read('onboarding.js');
  assert.match(source,/Array\.isArray\(connections\)/);
  assert.match(source,/selectedConnection/);
  assert.match(source,/last_sync_status === 'success'/);
  assert.match(source,/functionRequest\('product-costs'/);
  assert.match(source,/functionRequest\('dashboard-summary'/);
  assert.match(source,/costCount > 0/);
  assert.match(source,/summaryTransactions > 0/);
  assert.doesNotMatch(source,/Math\.random\(|demoProgress|fakeProgress/i);
});

test('guided next actions point to existing activation sections and refresh after writes',async()=>{
  const source=await read('onboarding.js');
  for(const target of ['#connections','#credentials','#costs','#dashboard'])assert.match(source,new RegExp(target.replace('#','\\#')));
  assert.match(source,/loadConnections = async function guidedLoadConnections/);
  assert.match(source,/refreshConnectionData = async function guidedRefreshConnectionData/);
  assert.match(source,/scrollIntoView\(\{ behavior: 'smooth'/);
  assert.match(source,/aria-current/);
});

test('guided onboarding remains responsive and uses the existing workspace design tokens',async()=>{
  const css=await read('onboarding.css');
  assert.match(css,/\.onboarding-guide/);
  assert.match(css,/var\(--v4-line\)/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:620px\)/);
});
