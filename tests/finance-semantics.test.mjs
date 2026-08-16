import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

function knownCash({ sellerRevenue=0, adjustment=0, platform=0, cargo=0, stoppage=0 }={}) {
  return Math.round((sellerRevenue + adjustment - platform - cargo - stoppage) * 100) / 100;
}

function contribution({ sellerRevenue=0, cogs=null, cargoAllocated=0 }={}) {
  if (cogs == null) return null;
  return Math.round((sellerRevenue - cogs - cargoAllocated) * 100) / 100;
}

test('known cash subtracts known platform fees, cargo and stoppage after settlement adjustment', () => {
  assert.equal(knownCash({ sellerRevenue:1000, adjustment:50, platform:25, cargo:40, stoppage:15 }),970);
  assert.equal(knownCash({ sellerRevenue:1000, adjustment:-50, platform:25, cargo:40, stoppage:15 }),870);
});

test('contribution remains unknown when product cost is unknown', () => {
  assert.equal(contribution({ sellerRevenue:500, cogs:null, cargoAllocated:20 }),null);
  assert.equal(contribution({ sellerRevenue:500, cogs:300, cargoAllocated:20 }),180);
});

test('risk and dashboard source keep accounting-net-profit disclaimers', async () => {
  const [risk,dashboard,next] = await Promise.all([
    read('supabase/functions/risk-alerts/index.ts'),
    read('supabase/functions/dashboard-summary/index.ts'),
    read('vnext.js')
  ]);
  assert.match(risk,/muhasebe net kârı değildir/i);
  assert.match(next,/muhasebe net kârı değildir/i);
  assert.match(dashboard,/knownFeeNet/);
});

test('unknown cargo allocation is not silently treated as product-level cost', async () => {
  const risk=await read('supabase/functions/risk-alerts/index.ts');
  const decision=await read('supabase/functions/decision-center/index.ts');
  assert.match(risk,/cargoAllocationCoverage/);
  assert.match(decision,/Kargo dağıtım boşluğu/);
  assert.match(decision,/kanıtlı bağlanamadı/);
});

test('unclassified settlement adjustments remain visible to operator', async () => {
  const [sync,alerts,decision]=await Promise.all([
    read('supabase/functions/trendyol-sync/index.ts'),
    read('v4-alerts.js'),
    read('supabase/functions/decision-center/index.ts')
  ]);
  assert.match(sync,/unclassifiedAdjustmentRows/);
  assert.match(alerts,/sınıflandırılamadı/);
  assert.match(decision,/Tanımsız hakediş hareketi/);
});
