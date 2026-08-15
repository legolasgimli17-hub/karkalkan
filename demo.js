const demoData={
  30:{
    grossSales:'₺184.250',returns:'₺16.480',returnMeta:'%8,9 iade oranı',commission:'₺31.725',commissionMeta:"Satışların %17,2'si",sellerRevenue:'₺132.900',profit:'₺27.840',margin:'%20,9',cogs:'₺92.220',cargo:'₺12.840',stoppage:'₺4.820',coverage:86,
    products:[
      {name:'Oversize Basic Sweatshirt',code:'869900001221',units:214,revenue:'₺42.680',profit:'₺10.940',margin:'%25,6',state:'İyi kazandırıyor',kind:'good'},
      {name:'Kadın Ribana Crop',code:'869900001347',units:167,revenue:'₺31.920',profit:'₺2.080',margin:'%6,5',state:'Az kazandırıyor',kind:'warn'},
      {name:'Unisex Canvas Çanta',code:'869900001511',units:96,revenue:'₺18.460',profit:'-₺620',margin:'-%3,4',state:'Zarar ettiriyor',kind:'bad'},
      {name:'Basic Jogger Pantolon',code:'869900001733',units:71,revenue:'₺14.790',profit:'—',margin:'—',state:'Maliyet girilmemiş',kind:'missing'}
    ],
    risks:[
      {title:'Canvas Çanta',score:'ACİL',text:'Bu üründe satıştan kalan para, ürün maliyeti ve kargoyu karşılamıyor.',value:'-₺620',meta:'Fiyatı, ürün maliyetini veya kargo giderini kontrol et.'},
      {title:'Ribana Crop',score:'DİKKAT',text:'Bu ürün para kazandırıyor ama kalan pay düşük. Küçük bir indirim bile kazancı silebilir.',value:'%6,5',meta:'Kampanya yapmadan önce tekrar hesapla.'},
      {title:'Maliyeti eksik ürünler',score:'EKSİK BİLGİ',text:'Bazı ürünlerin maliyeti girilmediği için ne kadar para bıraktığı henüz hesaplanamıyor.',value:'%14 eksik',meta:'En çok satan ürünlerin maliyetinden başla.'}
    ]
  },
  7:{
    grossSales:'₺46.830',returns:'₺3.720',returnMeta:'%7,9 iade oranı',commission:'₺8.140',commissionMeta:"Satışların %17,4'ü",sellerRevenue:'₺34.120',profit:'₺7.460',margin:'%21,9',cogs:'₺23.610',cargo:'₺3.050',stoppage:'₺1.260',coverage:91,
    products:[
      {name:'Oversize Basic Sweatshirt',code:'869900001221',units:58,revenue:'₺11.490',profit:'₺3.080',margin:'%26,8',state:'İyi kazandırıyor',kind:'good'},
      {name:'Kadın Ribana Crop',code:'869900001347',units:39,revenue:'₺7.540',profit:'₺510',margin:'%6,8',state:'Az kazandırıyor',kind:'warn'},
      {name:'Unisex Canvas Çanta',code:'869900001511',units:25,revenue:'₺4.880',profit:'-₺140',margin:'-%2,9',state:'Zarar ettiriyor',kind:'bad'},
      {name:'Basic Jogger Pantolon',code:'869900001733',units:14,revenue:'₺2.960',profit:'—',margin:'—',state:'Maliyet girilmemiş',kind:'missing'}
    ],
    risks:[
      {title:'Canvas Çanta',score:'ACİL',text:'Bu ürün son 7 günde de para kaybettiriyor.',value:'-₺140',meta:'Fiyatı, ürün maliyetini veya kargo giderini kontrol et.'},
      {title:'Ribana Crop',score:'DİKKAT',text:'Ürün para kazandırıyor ama kalan pay hâlâ düşük.',value:'%6,8',meta:'Kampanya yapmadan önce tekrar hesapla.'},
      {title:'Maliyeti eksik ürünler',score:'EKSİK BİLGİ',text:'Bazı ürünlerin maliyeti girilmediği için ne kadar para bıraktığı hesaplanamıyor.',value:'%9 eksik',meta:'Maliyetleri tamamladıkça sonuç daha anlamlı olur.'}
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
  document.getElementById('coverageText').textContent=`Satışların %${d.coverage}'sında ürün maliyeti girilmiş. Diğer ürünlerde ne kadar kaldığını hesaplamak için maliyet bilgisi gerekiyor.`;
  renderProducts(d.products);
  renderRisks(d.risks);
  document.querySelectorAll('[data-range]').forEach(btn=>btn.classList.toggle('active',btn.dataset.range===String(range)));
  if(window.va)window.va('event','demo_range_change',{range_days:Number(range)});
}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-range]').forEach(btn=>btn.addEventListener('click',()=>render(Number(btn.dataset.range))));
  render(30);
});
