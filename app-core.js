'use strict';
const $=id=>document.getElementById(id);
const currency=new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2});
const fmtMoney=v=>Number.isFinite(v)?currency.format(v):'Hesaplanamaz';
const fmtPct=v=>Number.isFinite(v)?`%${v.toFixed(1).replace('.',',')}`:'—';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));

function parseTRNumber(value){
  if(typeof value==='number') return Number.isFinite(value)?value:NaN;
  let s=String(value??'').trim(); if(!s) return NaN;
  s=s.replace(/\s/g,'').replace(/₺|TL|TRY/gi,'');
  const neg=/^\(.*\)$/.test(s); s=s.replace(/[()]/g,'');
  const lastComma=s.lastIndexOf(','), lastDot=s.lastIndexOf('.');
  if(lastComma>-1 && lastDot>-1){
    if(lastComma>lastDot) s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  } else if(lastComma>-1){
    s=s.replace(/\./g,'').replace(',','.');
  } else if(lastDot>-1){
    const parts=s.split('.');
    if(parts.length>2) s=parts.join('');
    else if(parts.length===2 && parts[1].length===3 && parts[0].length>0) s=parts.join('');
  }
  s=s.replace(/[^0-9+\-.]/g,'');
  const n=Number(s); return Number.isFinite(n)?(neg?-Math.abs(n):n):NaN;
}
function val(id,fallback=0){const n=parseTRNumber($(id).value);return Number.isFinite(n)?n:fallback}
function boolVal(v,def=true){if(typeof v==='boolean')return v;const s=String(v??'').trim().toLowerCase();if(['evet','yes','true','1','e'].includes(s))return true;if(['hayir','hayır','no','false','0','h'].includes(s))return false;return def}

function getInputs(){return {
 salePrice:val('salePrice'),saleVatRate:val('saleVatRate'),productCost:val('productCost'),purchaseVatRate:val('purchaseVatRate'),deductInputVat:$('deductInputVat').checked,
 commissionRate:val('commissionRate'),serviceRate:val('serviceRate'),otherPercentRate:val('otherPercentRate'),shippingCost:val('shippingCost'),packagingCost:val('packagingCost'),adRate:val('adRate'),otherFixedCost:val('otherFixedCost'),minMargin:val('minMargin'),targetMargin:val('targetMargin'),
 returnRate:val('returnRate'),returnExtraCost:val('returnExtraCost'),returnProductLossRate:val('returnProductLossRate'),returnNonRefundedFee:val('returnNonRefundedFee')
}}
function validate(v){
 const errors=[]; const nonneg=['salePrice','productCost','shippingCost','packagingCost','otherFixedCost','returnExtraCost','returnNonRefundedFee'];
 if(!(v.salePrice>0))errors.push('Satış fiyatı 0’dan büyük olmalı.');
 for(const k of nonneg) if(v[k]<0) errors.push(`${k} negatif olamaz.`);
 for(const k of ['saleVatRate','purchaseVatRate','commissionRate','serviceRate','otherPercentRate','adRate','minMargin','targetMargin','returnRate','returnProductLossRate']) if(v[k]<0||v[k]>100) errors.push(`${k} %0–%100 aralığında olmalı.`);
 if(v.returnRate>=100)errors.push('İade oranı %100 olamaz; gerçekleşen satış geliri kalmaz.');
 if(v.commissionRate+v.serviceRate+v.otherPercentRate>100)errors.push('Komisyon + hizmet + diğer yüzde kesintileri toplamı %100’ü aşamaz.');
 if(v.targetMargin>=95)errors.push('Hedef marj %95’in altında olmalı.');
 return errors;
}
function engine(v){
 const r=clamp(v.returnRate/100,0,.999), success=1-r, loss=clamp(v.returnProductLossRate/100,0,1);
 const feeRate=(v.commissionRate+v.serviceRate+v.otherPercentRate)/100, adRate=v.adRate/100;
 const grossRevenue=v.salePrice*success;
 const netRevenue=grossRevenue/(1+Math.max(0,v.saleVatRate)/100);
 const grossProductCost=v.productCost*(success+r*loss);
 const productUnitNet=v.deductInputVat?v.productCost/(1+Math.max(0,v.purchaseVatRate)/100):v.productCost;
 const netProductCost=productUnitNet*(success+r*loss);
 const platformFees=v.salePrice*success*feeRate;
 const adCost=v.salePrice*adRate;
 const fixedOps=v.shippingCost+v.packagingCost+v.otherFixedCost;
 const returnLoss=r*(v.returnExtraCost+v.returnNonRefundedFee);
 const grossProfit=grossRevenue-grossProductCost-platformFees-adCost-fixedOps-returnLoss;
 const vatProfit=netRevenue-netProductCost-platformFees-adCost-fixedOps-returnLoss;
 const grossMargin=grossRevenue>0?grossProfit/grossRevenue*100:NaN;
 const vatMargin=netRevenue>0?vatProfit/netRevenue*100:NaN;
 const grossRevenueCoeff=success;
 const vatRevenueCoeff=success/(1+Math.max(0,v.saleVatRate)/100);
 const commonPriceDeduction=success*feeRate+adRate;
 const grossFixed=grossProductCost+fixedOps+returnLoss;
 const vatFixed=netProductCost+fixedOps+returnLoss;
 const grossProfitCoeff=grossRevenueCoeff-commonPriceDeduction;
 const vatProfitCoeff=vatRevenueCoeff-commonPriceDeduction;
 function priceMetrics(mode,target){
   const revenueCoeff=mode==='vat'?vatRevenueCoeff:grossRevenueCoeff;
   const profitCoeff=mode==='vat'?vatProfitCoeff:grossProfitCoeff;
   const fixed=mode==='vat'?vatFixed:grossFixed;
   const breakEven=profitCoeff>0?fixed/profitCoeff:Infinity;
   const denom=profitCoeff-(target/100)*revenueCoeff;
   const targetPrice=denom>0?fixed/denom:Infinity;
   return {breakEven,targetPrice,revenueCoeff,profitCoeff,fixed};
 }
 return {r,success,feeRate,adRate,grossRevenue,netRevenue,grossProductCost,netProductCost,platformFees,adCost,fixedOps,returnLoss,grossProfit,vatProfit,grossMargin,vatMargin,priceMetrics};
}
function selectedResult(v,e){const mode=$('analysisMode').value;return {mode,profit:mode==='vat'?e.vatProfit:e.grossProfit,margin:mode==='vat'?e.vatMargin:e.grossMargin,revenue:mode==='vat'?e.netRevenue:e.grossRevenue,...e.priceMetrics(mode,v.targetMargin)}}
function classify(v,s){if(s.profit<0)return {key:'loss',label:'Zarar',cls:'bad'};if(s.margin<v.minMargin)return {key:'risk',label:'Riskli',cls:'warn'};return {key:'healthy',label:'Sağlıklı',cls:'good'}}
function renderValidation(errors){const box=$('validationBox');if(errors.length){box.innerHTML='<b>Kontrol et:</b><br>'+errors.map(x=>'• '+x).join('<br>');box.classList.add('show')}else{box.textContent='';box.classList.remove('show')}}
function render(){
 const v=getInputs(),errors=validate(v);renderValidation(errors);const e=engine(v),s=selectedResult(v,e),c=classify(v,s);
 $('grossProfit').textContent=fmtMoney(e.grossProfit);$('vatProfit').textContent=fmtMoney(e.vatProfit);$('selectedMargin').textContent=fmtPct(s.margin);$('expectedRevenue').textContent=fmtMoney(s.revenue);$('breakEvenPrice').textContent=fmtMoney(s.breakEven);$('targetPrice').textContent=fmtMoney(s.targetPrice);$('expectedReturnLoss').textContent=fmtMoney(e.returnLoss);$('feeRateDisplay').textContent=fmtPct(e.feeRate*100);
 const st=$('statusBox');st.className='status '+c.cls;st.textContent=c.key==='loss'?`Zarar: seçili görünümde sipariş başına ${fmtMoney(Math.abs(s.profit))} kayıp.`:c.key==='risk'?`Riskli: marj ${fmtPct(s.margin)}, belirlediğin minimum ${fmtPct(v.minMargin)} seviyesinin altında.`:`Sağlıklı: seçili görünümde ${fmtMoney(s.profit)} kâr ve ${fmtPct(s.margin)} marj.`;
 $('heroProfit').textContent=fmtMoney(s.profit);$('heroMargin').textContent=fmtPct(s.margin);$('heroBreakEven').textContent=fmtMoney(s.breakEven);$('heroRisk').textContent=c.label;$('heroRisk').className=c.cls;
 renderCampaign();renderProfiles();drawPriceChart();
}

function campaignInputs(){return {discountRate:val('discountRate'),campaignExtraAd:val('campaignExtraAd'),campaignPerOrderCost:val('campaignPerOrderCost'),campaignTotalBudget:val('campaignTotalBudget'),baseUnits:Math.max(0,val('baseUnits')),salesLift:val('salesLift')}}
function renderCampaign(){
 const v=getInputs(),ci=campaignInputs(),baseE=engine(v),baseS=selectedResult(v,baseE);const price=v.salePrice*(1-clamp(ci.discountRate/100,0,.99));
 const cv={...v,salePrice:price,adRate:v.adRate+ci.campaignExtraAd,otherFixedCost:v.otherFixedCost+ci.campaignPerOrderCost};const ce=engine(cv);const cs=selectedResult(cv,ce);
 const units=ci.baseUnits*(1+ci.salesLift/100);const normalTotal=baseS.profit*ci.baseUnits;const campaignTotal=cs.profit*units-ci.campaignTotalBudget;
 let requiredLift=Infinity;if(cs.profit>0&&ci.baseUnits>0){const requiredUnits=(normalTotal+ci.campaignTotalBudget)/cs.profit;requiredLift=(requiredUnits/ci.baseUnits-1)*100}
 $('campaignPrice').textContent=fmtMoney(price);$('campaignUnitProfit').textContent=fmtMoney(cs.profit);$('normalTotalProfit').textContent=fmtMoney(normalTotal);$('campaignTotalProfit').textContent=fmtMoney(campaignTotal);$('requiredLift').textContent=Number.isFinite(requiredLift)?fmtPct(requiredLift):'Mümkün değil';
 const st=$('campaignStatus'),ad=$('campaignAdvice');st.className='status';
 if(cs.profit<=0){st.classList.add('bad');st.textContent='Kampanya ürün başına zarar ediyor.';ad.innerHTML=`Bu kampanya satış adedi artsa bile her ek siparişte zarar üretiyor. İndirim veya ek giderleri azaltmadan ölçeklemek mantıklı görünmüyor.`}
 else if(campaignTotal<normalTotal){st.classList.add('warn');st.textContent=`Tahmini kampanya kârı normal dönemden ${fmtMoney(normalTotal-campaignTotal)} daha düşük.`;ad.innerHTML=Number.isFinite(requiredLift)?`Normal dönemi yakalamak için sipariş adedinin yaklaşık <strong>${fmtPct(requiredLift)}</strong> artması gerekir. Senin varsayımın ${fmtPct(ci.salesLift)}.`:'Başa baş artış hesaplanamıyor.'}
 else{st.classList.add('good');st.textContent=`Tahmini toplam kâr normal dönemden ${fmtMoney(campaignTotal-normalTotal)} daha yüksek.`;ad.innerHTML=Number.isFinite(requiredLift)?`Başa baş artış yaklaşık <strong>${fmtPct(requiredLift)}</strong>; sen ${fmtPct(ci.salesLift)} varsaydın. Varsayım gerçekleşirse kampanya kârlı görünüyor.`:'Kampanya kârlı görünüyor.'}
}

function drawPriceChart(){
 const canvas=$('priceChart'),ctx=canvas.getContext('2d'),v=getInputs(),mode=$('analysisMode').value;const W=canvas.width,H=canvas.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#0b1328';ctx.fillRect(0,0,W,H);
 const min=Math.max(1,v.salePrice*.55),max=v.salePrice*1.45;const pts=[];for(let i=0;i<=40;i++){const p=min+(max-min)*i/40;const vv={...v,salePrice:p};const e=engine(vv),s=selectedResult(vv,e);pts.push([p,s.profit])}
 const ys=pts.map(p=>p[1]);let yMin=Math.min(...ys,0),yMax=Math.max(...ys,0);if(yMax===yMin)yMax=yMin+1;const pad=38,x=xv=>pad+(xv-min)/(max-min)*(W-pad*1.4),y=yv=>H-pad-(yv-yMin)/(yMax-yMin)*(H-pad*1.7);
 ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,y(0));ctx.lineTo(W-pad*.4,y(0));ctx.stroke();ctx.strokeStyle='#8ca7ff';ctx.lineWidth=3;ctx.beginPath();pts.forEach((p,i)=>{if(i===0)ctx.moveTo(x(p[0]),y(p[1]));else ctx.lineTo(x(p[0]),y(p[1]))});ctx.stroke();
 ctx.fillStyle='#aeb8d2';ctx.font='12px system-ui';ctx.fillText(fmtMoney(min),pad,H-10);ctx.fillText(fmtMoney(max),W-110,H-10);ctx.fillText(fmtMoney(yMax),6,18);ctx.fillText(fmtMoney(yMin),6,H-32);
 const cur=engine(v),s=selectedResult(v,cur);ctx.fillStyle=s.profit>=0?'#8ee3ae':'#ff8e9d';ctx.beginPath();ctx.arc(x(v.salePrice),y(s.profit),5,0,Math.PI*2);ctx.fill();
}

const PROFILE_KEY='karkalkan_v3_profiles',SCENARIO_KEY='karkalkan_v3_scenarios';

// Reject malformed numeric input instead of silently converting it to zero.
const KK_MAX_ABS_NUMBER=1e12,KK_MAX_MONEY=1e9;
const kkLegacyParseTRNumber=parseTRNumber;
parseTRNumber=function(value){
 if(typeof value==='number')return Number.isFinite(value)&&Math.abs(value)<=KK_MAX_ABS_NUMBER?value:NaN;
 const raw=String(value??'').trim();if(!raw)return NaN;
 const cleaned=raw.replace(/\s/g,'').replace(/₺|TL|TRY/gi,'').replace(/[()]/g,'');
 if(!/[0-9]/.test(cleaned)||/[^0-9+\-.,]/.test(cleaned))return NaN;
 const n=kkLegacyParseTRNumber(value);return Number.isFinite(n)&&Math.abs(n)<=KK_MAX_ABS_NUMBER?n:NaN;
};
val=function(id,fallback=0){const raw=$(id).value;if(String(raw??'').trim()==='')return fallback;const n=parseTRNumber(raw);return Number.isFinite(n)?n:NaN};
const kkLegacyValidate=validate;
validate=function(v){
 const errors=kkLegacyValidate(v),numeric=['salePrice','saleVatRate','productCost','purchaseVatRate','commissionRate','serviceRate','otherPercentRate','shippingCost','packagingCost','adRate','otherFixedCost','minMargin','targetMargin','returnRate','returnExtraCost','returnProductLossRate','returnNonRefundedFee'];
 for(const k of numeric)if(!Number.isFinite(v[k]))errors.push(`${k} geçerli bir sayı olmalı.`);
 for(const k of ['salePrice','productCost','shippingCost','packagingCost','otherFixedCost','returnExtraCost','returnNonRefundedFee'])if(Number.isFinite(v[k])&&v[k]>KK_MAX_MONEY)errors.push(`${k} güvenli hesaplama sınırını aşıyor.`);
 return [...new Set(errors)];
};

// Product funnel analytics. No prices, product names or uploaded file contents are sent.
(()=>{
 const PREFIX='kk_funnel_v1_';
 const track=(name,data)=>{try{if(typeof window.va==='function')window.va('event',{name,data:data||{}})}catch(_){}};
 const once=(key,name,data)=>{try{const k=PREFIX+key;if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}catch(_){}track(name,data)};
 const motor=$('motor');
 if(motor){const started=e=>{if(e.target&&e.target.matches('input,select'))once('profit_started','ProfitAnalysisStarted')};motor.addEventListener('input',started,{passive:true});motor.addEventListener('change',started,{passive:true})}
 const campaign=$('kampanya');
 if(campaign){const started=e=>{if(e.target&&e.target.matches('input,select'))once('campaign_started','CampaignAnalysisStarted')};campaign.addEventListener('input',started,{passive:true});campaign.addEventListener('change',started,{passive:true})}
 document.querySelectorAll('a[href="#motor"],a[href="/#motor"]').forEach(a=>a.addEventListener('click',()=>once('cta_motor','HeroCtaClicked',{target:'motor'}),{passive:true}));
 const demo=$('demoBtn');if(demo)demo.addEventListener('click',()=>once('demo_loaded','DemoLoaded'),{passive:true});
 const bulk=$('bulkFile');if(bulk)bulk.addEventListener('change',()=>{const f=bulk.files&&bulk.files[0];if(!f)return;const ext=(f.name.split('.').pop()||'').toLowerCase();once('bulk_selected','BulkFileSelected',{format:ext==='xlsx'?'xlsx':'csv'})},{passive:true});
 const body=$('bulkBody');if(body){const detect=()=>{const rows=[...body.querySelectorAll('tr')];if(rows.some(r=>!r.querySelector('.empty')&&r.querySelectorAll('td').length>=8))once('bulk_completed','BulkAnalysisCompleted')};new MutationObserver(detect).observe(body,{childList:true,subtree:true});detect()}
 const exp=$('exportBtn');if(exp)exp.addEventListener('click',()=>{if(!exp.disabled)track('BulkResultsExported')},{passive:true});
 const profile=$('saveProfileBtn');if(profile)profile.addEventListener('click',()=>track('ProfileSaveAttempted'),{passive:true});
 const scenario=$('saveScenarioBtn');if(scenario)scenario.addEventListener('click',()=>track('ScenarioSaveAttempted'),{passive:true});
})();
