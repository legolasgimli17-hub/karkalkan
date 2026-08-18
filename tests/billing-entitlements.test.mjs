import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd();
const read=(path)=>readFile(join(root,path),'utf8');

test('paid plan store entitlements are defined server-side and free access cannot create live stores',async()=>{
  const billing=await read('supabase/functions/_shared/billing.ts');
  assert.match(billing,/starter[^\n]*stores:1[^\n]*orders:500/);
  assert.match(billing,/growth[^\n]*stores:3[^\n]*orders:5000/);
  assert.match(billing,/scale[^\n]*stores:10[^\n]*orders:50000/);
  assert.match(billing,/ENTITLED_STATUSES[^\n]*trialing[^\n]*active[^\n]*past_due/);
  assert.match(billing,/if\(!plan\|\|!ENTITLED_STATUSES\.has\(normalizedStatus\)\)return \{planKey:'free' as const,stores:0,orders:0,entitled:false\}/);
});

test('marketplace connection creation enforces the entitlement atomically',async()=>{
  const connections=await read('supabase/functions/marketplace-connections/index.ts');
  assert.match(connections,/planEntitlements/);
  assert.match(connections,/pg_advisory_xact_lock\(hashtextextended/);
  assert.match(connections,/select plan_key,status from public\.billing_subscriptions where user_id=/);
  assert.match(connections,/select count\(\*\)::int as count from public\.marketplace_connections where user_id=/);
  assert.match(connections,/storesUsed>=entitlement\.stores/);
  assert.match(connections,/PLAN_STORE_LIMIT_REACHED/);
  assert.match(connections,/return json\(\{error:'PLAN_STORE_LIMIT_REACHED',\.\.\.limitDetails\},403,origin\)/);
});

test('billing summary exposes effective store capacity without trusting the browser',async()=>{
  const summary=await read('supabase/functions/billing-summary/index.ts');
  assert.match(summary,/planEntitlements\(effectiveSubscription\.plan_key,effectiveSubscription\.status\)/);
  assert.match(summary,/usage:\{stores,storeLimit:entitlement\.stores,canCreateStore:stores<entitlement\.stores\}/);
  assert.match(summary,/entitlement:\{planKey:entitlement\.planKey,stores:entitlement\.stores,orders:entitlement\.orders,entitled:entitlement\.entitled\}/);
});
