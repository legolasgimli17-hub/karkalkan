import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('root index is the unified finance workspace',async()=>{
  const html=await read('index.html');
  assert.match(html,/class="workspace-sidebar"/);
  assert.match(html,/id="salesLine"/);
  assert.match(html,/id="costDonut"/);
  assert.match(html,/class="bridge-grid"/);
  assert.match(html,/id="productRows"/);
  assert.match(html,/id="riskCards"/);
  assert.match(html,/id="rakipler"/);
  assert.match(html,/id="hesaplayici"/);
  assert.match(html,/product-2026\.css/);
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

test('legacy calculator and demo routes return to the unified workspace',async()=>{
  const config=JSON.parse(await read('vercel.json'));
  const redirects=new Map(config.redirects.map(item=>[item.source,item.destination]));
  assert.equal(redirects.get('/hesapla'),'/#hesaplayici');
  assert.equal(redirects.get('/hesapla.html'),'/#hesaplayici');
  assert.equal(redirects.get('/demo'),'/#genel');
  assert.equal(config.rewrites.some(item=>item.source==='/hesapla'),false);
});

test('same-page simulator and competitor demo are interactive and privacy scoped',async()=>{
  const [html,app,js,css]=await Promise.all([read('index.html'),read('v4.html'),read('product-2026.js'),read('product-2026.css')]);
  assert.match(html,/Tahmini sipariş katkısı/);
  assert.match(app,/Simülasyon · gerçek rakip verisi değildir/);
  assert.match(js,/mountQuickSimulator/);
  assert.match(js,/mountCompetitorFilters/);
  assert.match(css,/--p-muted: #c0c7d1/);
  assert.doesNotMatch(js,/fetch\s*\(|XMLHttpRequest|functionRequest/);
});
