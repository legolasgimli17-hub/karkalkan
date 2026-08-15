const demoData={
  30:{
    grossSales:'₺184.250',returns:'₺16.480',returnMeta:'%8,9 iade oranı',commission:'₺31.725',commissionMeta:"Brüt satışın %17,2'si",sellerRevenue:'₺132.900',profit:'₺27.840',margin:'%20,9',cogs:'₺92.220',cargo:'₺12.840',stoppage:'₺4.820',coverage:86,
    products:[
      {name:'Oversize Basic Sweatshirt',code:'869900001221',units:214,revenue:'₺42.680',profit:'₺10.940',margin:'%25,6',state:'Sağlıklı',kind:'good'},
      {name:'Kadın Ribana Crop',code:'869900001347',units:167,revenue:'₺31.920',profit:'₺2.080',margin:'%6,5',state:'Düşük marj',kind:'warn'},
      {name:'Unisex Canvas Çanta',code:'869900001511',units:96,revenue:'₺18.460',profit:'-₺620',margin:'-%3,4',state:'Negatif katkı',kind:'bad'},
      {name:'Basic Jogger Pantolon',code:'869900001733',units:71,revenue:'₺14.790',profit:'—',margin:'—',state:'Maliyet eksik',kind:'missing'}
    ],
    risks:[
      {title:'Canvas Çanta',score:'YÜKSEK',text:'Ürün maliyeti ve tahsis edilen kargo sonrası katkı negatife dönüyor.',value:'-₺620',meta:'Önce fiyat / maliyet / kargo yükünü kontrol et.'},
      {title:'Ribana Crop',score:'ORTA',text:'Katkı marjı düşük. İndirim veya ek maliyet küçük bir değişimde marjı silebilir.',value:'%6,5',meta:'Marj eşiğinin altında.'},
      {title:'Maliyet kapsamı',score:'VERİ',text:'Satış hacminin bir bölümü maliyet bilgisi olmadığı için katkı hesabı dışında.',value:'%14 eksik',meta:'En yüksek satış hacimli eksiklerden başla.'}
    ]
  },
  7:{
    grossSales:'₺46.830',returns:'₺3.720',returnMeta:'%7,9 iade oranı',commission:'₺8.140',commissionMeta:"Brüt satışın %17,4'ü",sellerRevenue:'₺34.120',profit:'₺7.460',margin:'%21,9',cogs:'₺23.610',cargo:'₺3.050',stoppage:'₺1.260',coverage:91,
    products:[
      {name:'Oversize Basic Sweatshirt',code:'869900001221',units:58,revenue:'₺11.490',profit:'₺3.080',margin:'%26,8',state:'Sağlıklı',kind:'good'},
      {name:'Kadın Ribana Crop',code:'869900001347',units:39,revenue:'₺7.540',profit:'₺510',margin:'%6,8',state:'Düşük marj',kind:'warn'},
      {name:'Unisex Canvas Çanta',code:'869900001511',units:25,revenue:'₺4.880',profit:'-₺140',margin:'-%2,9',state:'Negatif katkı',kind:'bad'},
      {name:'Basic Jogger Pantolon',code:'869900001733',units:14,revenue:'₺2.960',profit:'—',margin:'—',state:'Maliyet eksik',kind:'missing'}
    ],
    risks:[
      {title:'Canvas Çanta',score:'YÜKSEK',text:'Son 7 günde de ürün katkısı negatif kalıyor.',value:'-₺140',meta:'Sorun tek güne bağlı görünmüyor.'},
      {title:'Ribana Crop',score:'ORTA',text:'Marj pozitif fakat güvenli alanın altında.',value:'%6,8',meta:'Kampanya öncesi tekrar kontrol et.'},
      {title:'Maliyet kapsamı',score:'VERİ',text:'Bu aralıkta maliyet kapsaması daha yüksek.',value:'%9 eksik',meta:'Eksik ürünler hâlâ toplam sonucu sınırlar.'}
    ]
  }
};

const ids=['grossSales','returns','returnMeta','commission','commissionMeta','sellerRevenue','profit','margin','cogs','cargo','stoppage'];
function statusClass(kind){return `status-pill status-${kind}`}
function renderProducts(items){
  const body=document.getElementById('productRows');
  body.innerHTML=items.map(p=>`<tr><td class="product-name"><strong>${p.name}</strong><small>${p.code}</small></td><td>${p.units}</td><td>${p.revenue}</td><td>${p.profit}</td><td>${p.margin}</td><td><span class="${statusClass(p.kind)}">${p.state}</span></td></tr>`).join('');
}
function renderRisks(items){
  const root=document.getElementById('riskCards');
  root.innerHTML=items.map(r=>`<article class="risk-demo-card"><div class="risk-head"><h3>${r.title}</h3><span class="risk-score">${r.score}</span></div><p>${r.text}</p><strong>${r.value}</strong><small>${r.meta}</small></article>`).join('');
}
function render(range){
  const d=demoData[range];
  ids.forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=d[id]});
  document.getElementById('coverage').textContent=`%${d.coverage}`;
  document.getElementById('coverageBar').className=`coverage-${d.coverage}`;
  document.getElementById('coverageText').textContent=`Satış hacminin %${d.coverage}'sında ürün maliyeti biliniyor. Kapsama dışında kalan ürünlerde katkı kârı hesaplanmaz.`;
  renderProducts(d.products);
  renderRisks(d.risks);
  document.querySelectorAll('[data-range]').forEach(btn=>btn.classList.toggle('active',btn.dataset.range===String(range)));
  if(window.va)window.va('event','demo_range_change',{range_days:Number(range)});
}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-range]').forEach(btn=>btn.addEventListener('click',()=>render(Number(btn.dataset.range))));
  render(30);
});
