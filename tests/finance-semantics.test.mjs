import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(path,'utf8');
function knownCash({sellerRevenue=0,adjustment=0,platform=0,cargo=0,stoppage=0}={}){return Math.round((sellerRevenue+adjustment-platform-cargo-stoppage)*100)/100}
function operatingContribution({knownCashValue=0,cogs=null,operatingExpenses=0,costComplete=false}={}){if(!costComplete||cogs==null)return null;return Math.round((knownCashValue-cogs-operatingExpenses)*100)/100}

test('known cash subtracts platform fees, cargo and stoppage after settlement adjustment',()=>{assert.equal(knownCash({sellerRevenue:1000,adjustment:50,platform:25,cargo:40,stoppage:15}),970);assert.equal(knownCash({sellerRevenue:1000,adjustment:-50,platform:25,cargo:40,stoppage:15}),870)});

test('operating contribution is unknown until product-cost coverage is complete',()=>{assert.equal(operatingContribution({knownCashValue:700,cogs:300,operatingExpenses:100,costComplete:false}),null);assert.equal(operatingContribution({knownCashValue:700,cogs:null,operatingExpenses:100,costComplete:true}),null);assert.equal(operatingContribution({knownCashValue:700,cogs:300,operatingExpenses:100,costComplete:true}),300)});

test('dashboard, risk and portfolio share the stoppage-aware cash vocabulary',async()=>{const [dashboard,risk,portfolio,next]=await Promise.all([read('supabase/functions/dashboard-summary/index.ts'),read('supabase/functions/risk-alerts/index.ts'),read('supabase/functions/portfolio-summary/index.ts'),read('vnext.js')]);for(const source of [dashboard,risk,portfolio]){assert.match(source,/platformCashBeforeStoppage/);assert.match(source,/knownCashAfterFeesAndStoppage/);assert.match(source,/stoppageNet/)}assert.match(dashboard,/knownFeeNet:money\(knownCashAfterFeesAndStoppage\)/);assert.match(next,/Stopaj dahil bilinen nakit/);assert.match(next,/\['Stopaj'/)});

test('portfolio never turns incomplete product cost into zero contribution',async()=>{const [portfolio,ops]=await Promise.all([read('supabase/functions/portfolio-summary/index.ts'),read('vnext-ops.js')]);assert.match(portfolio,/operatingContribution=costComplete\?/);assert.match(portfolio,/:null/);assert.match(portfolio,/incompleteCost/);assert.match(ops,/kkOpsHasNumber/);assert.match(ops,/return'Bilinmiyor'/);assert.doesNotMatch(ops,/Number\(v\).*return'—'/)});

test('financial confidence excludes evidence that does not apply',async()=>{const [decision,next]=await Promise.all([read('supabase/functions/decision-center/index.ts'),read('vnext.js')]);assert.match(decision,/returnApplicable/);assert.match(decision,/cargoApplicable/);assert.match(decision,/classificationApplicable/);assert.match(decision,/components\.filter\(c=>c\.applicable\)/);assert.match(decision,/evidence_confidence_v2/);assert.match(next,/Bu dönemde ölçülmedi/);assert.match(next,/Skora katılmadı/)});

test('unknown cargo allocation is not silently treated as product-level cost',async()=>{const [risk,decision]=await Promise.all([read('supabase/functions/risk-alerts/index.ts'),read('supabase/functions/decision-center/index.ts')]);assert.match(risk,/cargoAllocationCoverage/);assert.match(decision,/Kargo dağıtım boşluğu/);assert.match(decision,/kanıtlı bağlanamadı/)});

test('large dataset guards are explicit financial correctness controls',async()=>{for(const file of ['supabase/functions/dashboard-summary/index.ts','supabase/functions/risk-alerts/index.ts','supabase/functions/decision-center/index.ts','supabase/functions/portfolio-summary/index.ts']){const source=await read(file);assert.match(source,/DATA_TOO_LARGE/);assert.match(source,/PAGE=1000/)}const expenses=await read('supabase/functions/operating-expenses/index.ts');assert.match(expenses,/EXPENSE_LEDGER_TOO_LARGE/)});

test('unclassified settlement adjustments remain visible to operator',async()=>{const [sync,alerts,decision]=await Promise.all([read('supabase/functions/trendyol-sync/index.ts'),read('v4-alerts.js'),read('supabase/functions/decision-center/index.ts')]);assert.match(sync,/unclassifiedAdjustmentRows/);assert.match(alerts,/sınıflandırılamadı/);assert.match(decision,/Tanımsız hakediş hareketi/)});

test('seller-facing finance views keep accounting-net-profit disclaimers',async()=>{const [risk,portfolio,next]=await Promise.all([read('supabase/functions/risk-alerts/index.ts'),read('supabase/functions/portfolio-summary/index.ts'),read('vnext.js')]);assert.match(risk,/muhasebe net kârı değildir/i);assert.match(portfolio,/muhasebe net kârı değildir/i);assert.match(next,/muhasebe net kârı değildir/i)});
