import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd();
const read=(path)=>readFile(join(root,path),'utf8');

test('authenticated workspace loads first-party Vercel analytics after onboarding',async()=>{
  const html=await read('v4.html');
  assert.match(html,/onboarding\.js\?v=20260818[\s\S]*workspace-analytics\.js\?v=20260818[\s\S]*\/_vercel\/insights\/script\.js/);
  assert.doesNotMatch(html,/https:\/\/va\.vercel|https:\/\/vitals\.vercel/i);
});

test('workspace analytics reports only low-cardinality onboarding funnel state',async()=>{
  const source=await read('workspace-analytics.js');
  for(const stage of ['store','data','cost','decision','complete'])assert.match(source,new RegExp(`'${stage}'`));
  assert.match(source,/Onboarding Stage Viewed/);
  assert.match(source,/Onboarding Completed/);
  assert.match(source,/Onboarding Next Clicked/);
  assert.match(source,/Onboarding Step Clicked/);
  assert.match(source,/completedSteps/);
  assert.match(source,/targetStep/);
});

test('workspace analytics never reads seller identity, finance values or auth tokens',async()=>{
  const source=await read('workspace-analytics.js');
  for(const forbidden of ['userEmail','authEmail','sellerId','external_seller_id','connectionId','access_token','refresh_token','grossSales','sellerRevenue','coveredProfit','costAmount']){
    assert.doesNotMatch(source,new RegExp(forbidden,'i'));
  }
  assert.doesNotMatch(source,/localStorage/);
});

test('analytics redacts temporary workspace query and fragment values before sending URLs',async()=>{
  const source=await read('workspace-analytics.js');
  assert.match(source,/window\.va\('beforeSend'/);
  assert.match(source,/url\.pathname = '\/uygulama'/);
  assert.match(source,/url\.search = ''/);
  assert.match(source,/url\.hash = ''/);
});

test('analytics remains compatible with strict same-origin CSP',async()=>{
  const vercel=await read('vercel.json');
  const source=await read('workspace-analytics.js');
  assert.match(vercel,/script-src 'self'/);
  assert.match(source,/\/_vercel\/insights/);
  assert.doesNotMatch(source,/createElement\(['"]script['"]\)|eval\(|new Function\(/);
});
