import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  aggregateCashRows,
  contributionAfterKnownCosts,
  overlapShare,
  readAllPages,
  salesCostCoverage
} from '../supabase/functions/_shared/finance.js';
import { buildSyntheticStoreFixture } from './fixtures/synthetic-store.mjs';

const read=(path)=>readFile(path,'utf8');

test('shared finance core calculates stoppage-aware known cash',()=>{
  const rows=[{seller_revenue:1000,settlement_adjustment_net:50,platform_service_fee_cost:25,cargo_cost:40,stoppage_net:15}];
  assert.deepEqual(aggregateCashRows(rows),{
    sellerRevenue:1000,
    settlementAdjustmentNet:50,
    adjustedSellerRevenue:1050,
    platformServiceFeeCost:25,
    cargoCost:40,
    stoppageNet:15,
    platformCashBeforeStoppage:985,
    knownCashAfterFeesAndStoppage:970
  });
});

test('30-day fixture uses the exact same shared cash calculation as production endpoints',()=>{
  const fixture=buildSyntheticStoreFixture();
  assert.equal(fixture.dailyFinancials.length,30);
  const cash=aggregateCashRows(fixture.dailyFinancials);
  const manual=fixture.dailyFinancials.reduce((sum,row)=>sum+row.seller_revenue+row.settlement_adjustment_net-row.platform_service_fee_cost-row.cargo_cost-row.stoppage_net,0);
  assert.equal(cash.knownCashAfterFeesAndStoppage,Math.round(manual*100)/100);
  assert.ok(cash.knownCashAfterFeesAndStoppage>0);
});

test('incomplete product-cost coverage cannot produce operating contribution',()=>{
  const fixture=buildSyntheticStoreFixture();
  const coverage=salesCostCoverage(fixture.productMetrics);
  assert.ok(coverage.coverage<1);
  assert.equal(contributionAfterKnownCosts({knownCashAfterFeesAndStoppage:50000,knownCogs:coverage.knownCogs,operatingExpenses:9000,costCoverage:coverage.coverage,hasSales:true}),null);

  const completeRows=fixture.productMetrics.map(row=>({...row,known_cogs:row.known_cogs??5000}));
  const complete=salesCostCoverage(completeRows);
  assert.equal(complete.complete,true);
  assert.equal(typeof contributionAfterKnownCosts({knownCashAfterFeesAndStoppage:50000,knownCogs:complete.knownCogs,operatingExpenses:9000,costCoverage:complete.coverage,hasSales:true}),'number');
});

test('operating-expense allocation is proportional to overlapping calendar days',()=>{
  const share=overlapShare('2026-07-18','2026-08-16','2026-08-01','2026-08-31');
  assert.equal(Math.round(share*3100),1600);
});

test('shared paging helper returns every page and fails instead of silently truncating',async()=>{
  const values=Array.from({length:2500},(_,index)=>index);
  const all=await readAllPages(async(from,to)=>({data:values.slice(from,to+1),error:null}),{pageSize:1000,maxRows:5000});
  assert.equal(all.length,2500);
  await assert.rejects(()=>readAllPages(async(from,to)=>({data:Array.from({length:to-from+1},()=>1),error:null}),{pageSize:1000,maxRows:2000}),/DATA_TOO_LARGE/);
});

test('all seller finance endpoints import the shared finance core',async()=>{
  for(const file of ['dashboard-summary','risk-alerts','decision-center','portfolio-summary']){
    const source=await read(`supabase/functions/${file}/index.ts`);
    assert.match(source,/\.\.\/_shared\/finance\.js/);
    assert.doesNotMatch(source,/async function paged\(/);
  }
});

test('frontend has one consolidated vNext behavior script',async()=>{
  const [loader,next]=await Promise.all([read('v4-alerts.js'),read('vnext.js')]);
  assert.match(loader,/\/vnext\.js/);
  assert.doesNotMatch(loader,/vnext-ops\.js/);
  assert.match(next,/kkLoadExpenses/);
  assert.match(next,/kkLoadPortfolio/);
  assert.match(next,/async function kkRefreshAuxiliary/);
  assert.match(next,/Finansal veri güveni/);
  assert.match(next,/Stopaj dahil bilinen nakit/);
});

test('financial confidence excludes evidence that does not apply',async()=>{
  const [decision,next]=await Promise.all([read('supabase/functions/decision-center/index.ts'),read('vnext.js')]);
  assert.match(decision,/returnApplicable/);
  assert.match(decision,/cargoApplicable/);
  assert.match(decision,/classificationApplicable/);
  assert.match(decision,/activeComponents/);
  assert.match(decision,/evidence_confidence_v3_shared_finance/);
  assert.match(next,/Bu dönemde ölçülmedi/);
  assert.match(next,/Skora katılmadı/);
});

test('seller-facing finance views keep accounting-net-profit disclaimers',async()=>{
  const [risk,portfolio,next]=await Promise.all([read('supabase/functions/risk-alerts/index.ts'),read('supabase/functions/portfolio-summary/index.ts'),read('vnext.js')]);
  assert.match(risk,/muhasebe net kârı değildir/i);
  assert.match(portfolio,/muhasebe net kârı değildir/i);
  assert.match(next,/muhasebe net kârı değildir/i);
});
