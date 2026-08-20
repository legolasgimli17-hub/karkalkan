'use strict';

(() => {
  const QUESTIONS=[
    {key:'profit',label:'Kârı en çok ne bozuyor?'},
    {key:'priority',label:'Bugün neye bakmalıyım?'},
    {key:'confidence',label:'Bu veriye güvenebilir miyim?'},
    {key:'why',label:'AI bu cevabı neye dayandırdı?'}
  ];
  const moneyText=id=>String(document.getElementById(id)?.textContent||'—').trim();
  const numberFrom=id=>{const raw=moneyText(id).replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.');const n=Number(raw);return Number.isFinite(n)?Math.abs(n):0};
  const proof=()=>[
    {id:'sales',label:'Toplam satış',value:moneyText('grossSales')},
    {id:'revenue',label:'Kesintiler sonrası',value:moneyText('sellerRevenue')},
    {id:'profit',label:'Bilinen katkı',value:moneyText('profit')},
    {id:'commission',label:'Komisyon',value:moneyText('commission')},
    {id:'returns',label:'İadeler',value:moneyText('returns')},
    {id:'cargo',label:'Kargo',value:moneyText('cargo')},
    {id:'coverage',label:'Maliyet kapsamı',value:moneyText('coverage')}
  ];
  function cite(ids,map){return ids.map(id=>{const item=map.get(id);return item?`<span class="buyer-ai-cite">${item.label} · ${item.value}</span>`:''}).join('')}
  function analysis(key){
    const p=proof(),map=new Map(p.map(item=>[item.id,item]));const costs=[['commission',numberFrom('commission')],['returns',numberFrom('returns')],['cargo',numberFrom('cargo')]].sort((a,b)=>b[1]-a[1]);const biggest=map.get(costs[0][0]);
    if(key==='confidence')return {summary:`Bu demo görünümünde veri güveni ${map.get('coverage').value}. KârKalkan düşük kapsamı kesin kâr gibi sunmak yerine kanıt seviyesini ayrı gösterir.`,findings:[['Karar öncesi kapsamı kontrol et','Maliyet kapsamı yüksek olsa bile eksik kalan ürün maliyetleri sonucu değiştirebilir.',['coverage','profit']],['Rakam ile güven sinyalini ayır','AI yorumu finans motorunun ürettiği rakamları değiştirmez; yalnız açıklar.',['sales','revenue']]]};
    if(key==='priority')return {summary:`İlk inceleme noktası ${biggest.label.toLowerCase()} görünüyor. Sonra maliyet kapsamı eksik ürünleri tamamlamak daha güvenli bir ikinci adım.`,findings:[['En büyük görünür kesintiyi doğrula',`${biggest.label}, bu demo kanıt paketindeki komisyon/iade/kargo kalemleri arasında en yüksek tutar.`,[biggest.id]],['Kapsamı tamamla','Veri güveni tam değilse ticari aksiyondan önce ürün maliyetlerini tamamla.',['coverage']]]};
    if(key==='why')return {summary:'Bu cevap serbest metin “tahmini” değil; ekranda zaten görünen finans kanıtlarına bağlı. Gerçek üründe modelin bulgu/öneri üretmesi için geçerli evidence ID göstermesi zorunlu.',findings:[['Finans hesabı AI’da değil','Satış, kesinti sonrası tutar ve katkı KârKalkan motorunun çıktısıdır.',['sales','revenue','profit']],['Kanıtsız cevap kabul edilmez','Model var olmayan bir kaynak kimliği verirse cevap reddedilir ve deterministic özet gösterilir.',['commission','returns','cargo']]]};
    return {summary:`Bu demo döneminde görünür baskının başında ${biggest.label.toLowerCase()} geliyor. KârKalkan bunu “AI böyle dedi” diye değil, mevcut finans kanıtındaki en büyük kesinti sinyali olarak gösterir.`,findings:[['Baskın kesinti',`${biggest.label} seçili demo döneminin komisyon/iade/kargo grubunda en yüksek görünür kalemi.`,[biggest.id]],['Sonuç hâlâ pozitifte','Kesintilerden ve bilinen maliyetlerden sonra görünen katkı pozitif; ancak kapsam %100 değil.',['profit','coverage']],['Satış ile kalan tutarı birlikte izle','Ciro tek başına yeterli değil; kesintiler sonrası tutar ayrıca izleniyor.',['sales','revenue']]]};
  }
  function render(key){
    const root=document.getElementById('buyerAiDemo');if(!root)return;const data=analysis(key),map=new Map(proof().map(item=>[item.id,item]));
    root.querySelectorAll('[data-buyer-ai]').forEach(button=>button.classList.toggle('active',button.dataset.buyerAi===key));
    root.querySelector('#buyerAiSummary').textContent=data.summary;
    root.querySelector('#buyerAiFindings').innerHTML=data.findings.map(([title,text,ids])=>`<div class="buyer-ai-finding"><strong>${title}</strong><p>${text}</p><div class="buyer-ai-cites">${cite(ids,map)}</div></div>`).join('');
    root.querySelector('#buyerAiProof').innerHTML=proof().map(item=>`<div class="buyer-ai-proof-row"><span>${item.label}</span><strong>${item.value}</strong></div>`).join('');
  }
  function init(){
    const kpis=document.querySelector('.kpi-strip');if(!kpis||document.getElementById('buyerAiDemo'))return;const section=document.createElement('section');section.id='buyerAiDemo';section.className='buyer-ai-demo';section.innerHTML=`<div class="buyer-ai-head"><div><p class="card-kicker">KANITLI AI · ALICI DEMOSU</p><h3>AI cevabının altında rakamı göster.</h3><p>Bu interaktif bölüm sentetik ModaSepeti verisini kullanır. Gerçek müşteri, gerçek mağaza veya gerçek AI model çağrısı değildir; production’daki kanıta bağlı AI deneyiminin satış demosudur.</p></div><span class="buyer-ai-demo-badge">DEMO DATA · SENTETİK</span></div><div class="buyer-ai-presets">${QUESTIONS.map((q,index)=>`<button type="button" data-buyer-ai="${q.key}"${index===0?' class="active"':''}>${q.label}</button>`).join('')}</div><div class="buyer-ai-grid"><article class="buyer-ai-answer"><h4>Demo analiz</h4><p id="buyerAiSummary" class="buyer-ai-summary"></p><div id="buyerAiFindings" class="buyer-ai-findings"></div><p class="buyer-ai-guard"><strong>Gerçek üründeki fark:</strong> authenticated finance-ai endpoint’i model cevabını server-side evidence ID’leriyle doğrular; geçersiz citation olursa cevap reddedilir.</p></article><aside class="buyer-ai-proof"><h4>Kanıt paketi</h4><div id="buyerAiProof" class="buyer-ai-proof-list"></div></aside></div>`;kpis.insertAdjacentElement('afterend',section);section.querySelectorAll('[data-buyer-ai]').forEach(button=>button.addEventListener('click',()=>render(button.dataset.buyerAi)));document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>queueMicrotask(()=>render(section.querySelector('[data-buyer-ai].active')?.dataset.buyerAi||'profit'))));render('profit');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
