export function buildSyntheticStoreFixture() {
  const dailyFinancials=[];
  const start=Date.UTC(2026,6,18);
  let seed=42;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32};

  for(let day=0;day<30;day++){
    const date=new Date(start+day*86400000).toISOString().slice(0,10);
    const gross=round(8500+2200*Math.sin(day/4)+(rand()-.5)*1800);
    const returnRate=.055+([8,17,23].includes(day)?.06:0);
    const grossReturns=round(gross*returnRate);
    const commissionCost=round(gross*.188);
    const sellerRevenue=round(gross-grossReturns-commissionCost);
    const settlementAdjustmentNet=round(-90+rand()*220);
    const platformServiceFeeCost=round(gross*.0115);
    const cargoCost=round(420-65+rand()*150);
    const stoppageBase=Math.max(0,sellerRevenue+settlementAdjustmentNet-platformServiceFeeCost-cargoCost);
    const stoppageNet=round(stoppageBase*.01);
    dailyFinancials.push({date,gross_sales:gross,gross_returns:grossReturns,commission_cost:commissionCost,seller_revenue:sellerRevenue,settlement_adjustment_net:settlementAdjustmentNet,platform_service_fee_cost:platformServiceFeeCost,cargo_cost:cargoCost,stoppage_net:stoppageNet});
  }

  const totalGross=dailyFinancials.reduce((sum,row)=>sum+row.gross_sales,0);
  const productMetrics=[
    product('SKU-RED-001','Kırmızı Termos',.28,totalGross,14280,'order_v2_quantity',3,0),
    product('SKU-BLK-002','Siyah Termos',.24,totalGross,13140,'order_v2_quantity',3,0),
    product('SKU-MUG-003','Seramik Kupa',.18,totalGross,null,'order_v2_quantity',0,3),
    product('SKU-BAG-004','Bez Çanta',.16,totalGross,5040,'order_v2_quantity',0,0),
    product('SKU-BTL-005','Çelik Matara',.14,totalGross,null,'settlement_transaction_proxy',0,0)
  ];

  return {
    name:'synthetic-30d-seller',
    description:'Deterministic synthetic Trendyol-like fixture; no real seller data.',
    range:{start:'2026-07-18',end:'2026-08-16'},
    dailyFinancials,
    productMetrics,
    operatingExpenses:[
      {category:'ads',amount:7200,period_start:'2026-07-18',period_end:'2026-08-16'},
      {category:'software',amount:1290,period_start:'2026-08-01',period_end:'2026-08-31'},
      {category:'packaging',amount:2400,period_start:'2026-07-18',period_end:'2026-08-16'}
    ]
  };
}

function product(external_product_id,product_name,share,totalGross,known_cogs,sales_unit_basis,claim_item_matches,return_proxy_matches){
  return {external_product_id,product_name,gross_sales:round(totalGross*share),known_cogs,sales_unit_basis,claim_item_matches,return_proxy_matches};
}
function round(value){return Math.round(value*100)/100}
