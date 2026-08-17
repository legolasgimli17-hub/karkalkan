'use strict';

const workspaceData={
  30:{
    grossSales:'₺184.250',sellerRevenue:'₺132.900',profit:'₺27.840',margin:'%20,9 kalan oranı',coverage:86,cogs:'₺92.220',commission:'₺31.725',returns:'₺16.480',cargo:'₺12.840',costs:'₺105.060',delta:'+%12,4',grossTrend:'↑ %12,4',cashTrend:'↑ %9,8',donutProfit:'%15,1',
    salesPoints:'42,176 142,146 242,158 342,105 442,124 542,77 642,91 742,46',cashPoints:'42,192 142,176 242,181 342,151 442,164 542,127 642,139 742,104',
    products:[
      ['Oversize Basic Sweatshirt','869900001221','214','₺42.680','₺10.940','%25,6','İyi kazandırıyor','good'],
      ['Kadın Ribana Crop','869900001347','167','₺31.920','₺2.080','%6,5','Az kazandırıyor','warn'],
      ['Unisex Canvas Çanta','869900001511','96','₺18.460','−₺620','−%3,4','Zarar ettiriyor','bad'],
      ['Basic Jogger Pantolon','869900001733','71','₺14.790','—','—','Maliyet eksik','missing']
    ],
    risks:[
      ['Canvas Çanta','ACİL','Satıştan kalan tutar ürün maliyeti ve kargoyu karşılamıyor.','−₺620','Fiyat veya maliyet kontrolü'],
      ['Ribana Crop','DİKKAT','Kalan pay düşük; küçük bir kampanya kârı silebilir.','%6,5','Kampanya öncesi hesapla'],
      ['Maliyet kapsamı','EKSİK','Satışların %14’ünde ürün maliyeti henüz tanımlı değil.','%14','En çok satandan başla']
    ]
  },
  7:{
    grossSales:'₺46.830',sellerRevenue:'₺34.120',profit:'₺7.460',margin:'%21,9 kalan oranı',coverage:91,cogs:'₺23.610',commission:'₺8.140',returns:'₺3.720',cargo:'₺3.050',costs:'₺26.660',delta:'+%8,7',grossTrend:'↑ %8,7',cashTrend:'↑ %7,1',donutProfit:'%15,9',
    salesPoints:'42,184 142,162 242,171 342,132 442,144 542,96 642,112 742,73',cashPoints:'42,197 142,184 242,188 342,164 442,171 542,141 642,150 742,124',
    products:[
      ['Oversize Basic Sweatshirt','869900001221','58','₺11.490','₺3.080','%26,8','İyi kazandırıyor','good'],
      ['Kadın Ribana Crop','869900001347','39','₺7.540','₺510','%6,8','Az kazandırıyor','warn'],
      ['Unisex Canvas Çanta','869900001511','25','₺4.880','−₺140','−%2,9','Zarar ettiriyor','bad'],
      ['Basic Jogger Pantolon','869900001733','14','₺2.960','—','—','Maliyet eksik','missing']
    ],
    risks:[
      ['Canvas Çanta','ACİL','Ürün son 7 günlük görünümde de para kaybettiriyor.','−₺140','Fiyat veya maliyet kontrolü'],
      ['Ribana Crop','DİKKAT','Ürün para bırakıyor fakat güvenli marjın altında.','%6,8','Kampanya öncesi hesapla'],
      ['Maliyet kapsamı','EKSİK','Satışların %9’unda ürün maliyeti tanımlı değil.','%9','Eksik maliyetleri tamamla']
    ]
  }
};

const setText=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
function productRows(items){return items.map(([name,code,units,revenue,profit,margin,state,kind])=>`<tr><td class="product-cell"><strong>${name}</strong><small>${code}</small></td><td>${units}</td><td>${revenue}</td><td>${profit}</td><td>${margin}</td><td><span class="status ${kind}">${state}</span></td></tr>`).join('')}
function actionRows(items){return items.map(([title,level,text,value,next])=>`<article class="action-item"><div class="action-head"><strong>${title}</strong><span>${level}</span></div><p>${text}</p><footer><strong>${value}</strong><span>${next}</span></footer></article>`).join('')}

function renderWorkspace(range){
  const data=workspaceData[range];
  ['grossSales','sellerRevenue','profit','margin','cogs','commission','returns','cargo'].forEach(id=>setText(id,data[id]));
  setText('coverage',`%${data.coverage}`);setText('grossTrend',`${data.grossTrend} önceki döneme göre`);setText('cashTrend',`${data.cashTrend} önceki döneme göre`);setText('chartTotal',data.grossSales);setText('chartDelta',data.delta);setText('donutProfit',data.donutProfit);
  setText('coverageBadge',`%${data.coverage} maliyet kapsamı`);setText('bridgeSales',data.grossSales);setText('bridgeReturns',`−${data.returns}`);setText('bridgeCommission',`−${data.commission}`);setText('bridgeCosts',`−${data.costs}`);setText('bridgeProfit',data.profit);
  const ring=document.getElementById('coverageRing');if(ring)ring.style.setProperty('--coverage',`${data.coverage}%`);
  const sales=document.getElementById('salesLine'),cash=document.getElementById('cashLine'),area=document.getElementById('salesAreaShape');
  if(sales)sales.setAttribute('points',data.salesPoints);if(cash)cash.setAttribute('points',data.cashPoints);if(area)area.setAttribute('points',`42,208 ${data.salesPoints} 742,208`);
  const products=document.getElementById('productRows'),risks=document.getElementById('riskCards');if(products)products.innerHTML=productRows(data.products);if(risks)risks.innerHTML=actionRows(data.risks);
  document.querySelectorAll('[data-range]').forEach(button=>button.classList.toggle('active',Number(button.dataset.range)===range));
  window.va?.('event','workspace_range_change',{range_days:range});
}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>renderWorkspace(Number(button.dataset.range))));
  document.querySelectorAll('a[href="/uygulama"]').forEach(link=>link.addEventListener('click',()=>window.va?.('event','store_connect_cta_click',{cta_text:link.textContent.trim()})));
  renderWorkspace(30);
  window.va?.('event','workspace_demo_view');
});
