import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('root opens the unified finance workspace',async()=>{
  const config=JSON.parse(await read('vercel.json'));
  assert.ok(config.rewrites.some(rule=>rule.source==='/'&&rule.destination==='/home-v2.html'));
  const html=await read('home-v2.html');
  assert.match(html,/class="workspace-sidebar"/);
  assert.match(html,/id="salesLine"/);
  assert.match(html,/id="costDonut"/);
  assert.match(html,/class="bridge-grid"/);
  assert.match(html,/id="productRows"/);
  assert.match(html,/id="riskCards"/);
});

test('public demo and private workspace share one product language',async()=>{
  const app=await read('v4.html');
  const loader=await read('v4-alerts.js');
  const css=await read('workspace-v2.css');
  assert.doesNotMatch(app,/Mağaza Paneli|mağaza panelini/i);
  assert.match(loader,/workspace-v2\.css/);
  assert.match(css,/--ws-bg:#1b222b/);
  assert.match(css,/\.v4-body/);
  assert.match(css,/\.workspace-body/);
});

test('workspace demo keeps finance values interactive without calculating production money',async()=>{
  const js=await read('workspace-demo.js');
  assert.match(js,/workspaceData/);
  assert.match(js,/salesPoints/);
  assert.match(js,/renderWorkspace/);
  assert.doesNotMatch(js,/SUPABASE_SERVICE_ROLE_KEY|service_role|api_secret/i);
});
