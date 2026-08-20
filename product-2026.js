'use strict';

/* Presentation-only product interactions.
 * The simulator is intentionally scoped to the public demo and never sends input data.
 */
(function mountProductExperience() {
  void import('/buyer-ai-demo.js?v=20260821').catch(() => {});

  const money = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 2
  });

  function parseNumber(value) {
    const raw = String(value ?? '').trim().replace(/\s/g, '').replace(/₺|TL|TRY/gi, '');
    if (!raw) return NaN;
    const comma = raw.lastIndexOf(',');
    const dot = raw.lastIndexOf('.');
    let normalized = raw;
    if (comma > -1 && dot > -1) normalized = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
    else if (comma > -1) normalized = raw.replace(/\./g, '').replace(',', '.');
    else if (dot > -1 && raw.split('.').length === 2 && raw.split('.')[1].length === 3) normalized = raw.replace('.', '');
    const number = Number(normalized.replace(/[^0-9+\-.]/g, ''));
    return Number.isFinite(number) ? number : NaN;
  }

  function setText(id, value) {const element = document.getElementById(id);if (element) element.textContent = value;}

  function mountQuickSimulator() {
    const defaults = {quickSalePrice:'799',quickProductCost:'410',quickCommission:'17,5',quickShipping:'54',quickAdRate:'6',quickReturnRate:'4'};
    const fields = Object.keys(defaults).map(id => document.getElementById(id));if (fields.some(field => !field)) return;
    const render = () => {
      const salePrice=parseNumber(fields[0].value),productCost=parseNumber(fields[1].value),commissionRate=parseNumber(fields[2].value),shippingCost=parseNumber(fields[3].value),adRate=parseNumber(fields[4].value),returnRate=parseNumber(fields[5].value);
      const values=[salePrice,productCost,commissionRate,shippingCost,adRate,returnRate];
      const valid=values.every(Number.isFinite)&&salePrice>0&&productCost>=0&&shippingCost>=0&&commissionRate>=0&&commissionRate<=100&&adRate>=0&&adRate<=100&&returnRate>=0&&returnRate<100;
      const status=document.getElementById('quickStatus'),marker=document.getElementById('quickDecisionMarker');
      if(!valid){setText('quickProfit','Kontrol et');setText('quickMargin','—');setText('quickBreakEven','—');if(status){status.textContent='Geçerli ve pozitif değerler girin';status.className='bad'}if(marker)marker.style.left='0%';return}
      const returns=returnRate/100,success=1-returns,productLossOnReturn=.05,serviceRate=.01,packaging=8,returnOperationalLoss=returns*50,revenue=salePrice*success,productExpense=productCost*(success+returns*productLossOnReturn),platformExpense=salePrice*success*(commissionRate/100+serviceRate),advertisingExpense=salePrice*(adRate/100),fixedExpense=shippingCost+packaging+returnOperationalLoss,contribution=revenue-productExpense-platformExpense-advertisingExpense-fixedExpense,margin=revenue>0?contribution/revenue*100:NaN,contributionCoefficient=success-success*(commissionRate/100+serviceRate)-adRate/100,breakEven=contributionCoefficient>0?(productExpense+fixedExpense)/contributionCoefficient:Infinity;
      setText('quickProfit',money.format(contribution));setText('quickMargin',Number.isFinite(margin)?`%${margin.toFixed(1).replace('.',',')}`:'—');setText('quickBreakEven',Number.isFinite(breakEven)?money.format(breakEven):'Hesaplanamaz');
      const state=contribution<0?{label:'Zarar riski · fiyat veya maliyet kontrolü',className:'bad'}:margin<12?{label:'Dar katkı · kampanya öncesi yeniden hesaplayın',className:'warn'}:{label:'Sağlıklı katkı · varsayımları doğrulayın',className:'good'};
      if(status){status.textContent=state.label;status.className=state.className}if(marker)marker.style.left=`${Math.max(0,Math.min(100,(margin+10)/40*100))}%`;
    };
    fields.forEach(field=>field.addEventListener('input',render));document.getElementById('quickReset')?.addEventListener('click',()=>{for(const [id,value] of Object.entries(defaults))document.getElementById(id).value=value;render();window.va?.('event','quick_simulator_reset')});render();
    if(location.hash==='#hesaplayici')requestAnimationFrame(()=>document.getElementById('hesaplayici')?.scrollIntoView({block:'start'}));
  }

  function mountCompetitorFilters() {
    document.querySelectorAll('.competitor-lab').forEach(lab=>{const buttons=[...lab.querySelectorAll('[data-competitor-filter]')],rows=[...lab.querySelectorAll('[data-competitor-signal]')];if(!buttons.length||!rows.length)return;buttons.forEach(button=>button.addEventListener('click',()=>{const filter=button.dataset.competitorFilter;buttons.forEach(item=>item.classList.toggle('active',item===button));rows.forEach(row=>{row.hidden=filter!=='all'&&row.dataset.competitorSignal!==filter});window.va?.('event','competitor_demo_filter',{signal:filter})}))});
  }

  function mountSectionNavigation() {
    const links=[...document.querySelectorAll('.workspace-nav a[href^="#"]')];if(!links.length||!('IntersectionObserver' in window))return;const targets=links.map(link=>document.querySelector(link.getAttribute('href'))).filter(Boolean);const observer=new IntersectionObserver(entries=>{const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;links.forEach(link=>link.classList.toggle('active',link.getAttribute('href')===`#${visible.target.id}`))},{rootMargin:'-15% 0px -68% 0px',threshold:[0,.1,.3]});targets.forEach(target=>observer.observe(target));
  }

  document.addEventListener('DOMContentLoaded',()=>{mountQuickSimulator();mountCompetitorFilters();mountSectionNavigation()});
})();
