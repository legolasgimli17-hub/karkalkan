'use strict';

/*
 * KârKalkan visual layer.
 * This file does not calculate money. It turns already-rendered, real dashboard
 * data into a clearer visual hierarchy and uses labelled decorative diagrams
 * only where no seller data exists yet.
 */

const kkVisualState={mounted:false,observer:null};

function kkVisualSvg(tag,attrs={}){
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const[key,value]of Object.entries(attrs))el.setAttribute(key,String(value));
  return el;
}

function kkVisualAuth(){
  const host=document.querySelector('.auth-copy');
  if(!host||host.querySelector('.kk-auth-visual'))return;
  const visual=document.createElement('div');
  visual.className='kk-auth-visual';
  visual.setAttribute('aria-label','KârKalkan finans doğrulama akışı');
  visual.innerHTML=`
    <div class="kk-auth-orbit" aria-hidden="true">
      <div class="kk-orbit-ring ring-a"></div><div class="kk-orbit-ring ring-b"></div>
      <div class="kk-orbit-core"><span>K</span><small>kanıtlı finans</small></div>
      <span class="kk-orbit-node node-sale"><i>₺</i>Satış</span>
      <span class="kk-orbit-node node-settle"><i>✓</i>Hakediş</span>
      <span class="kk-orbit-node node-cargo"><i>↗</i>Kargo</span>
      <span class="kk-orbit-node node-cost"><i>◆</i>Maliyet</span>
    </div>
    <div class="kk-auth-flow-caption"><strong>Hızlı sinyal</strong><i></i><strong>Kanıt eşleştirme</strong><i></i><strong>Bilinen nakit</strong></div>`;
  host.append(visual);
}

function kkVisualCommand(){
  const host=document.querySelector('.kk-command-main');
  if(!host||host.querySelector('.kk-process-map'))return;
  const map=document.createElement('div');
  map.className='kk-process-map';
  map.setAttribute('aria-label','KârKalkan doğrulama akışı');
  map.innerHTML=`
    <div class="kk-process-line"></div>
    <div class="kk-process-step"><span>01</span><i class="pulse"></i><strong>Sipariş</strong><small>Anlık sinyal</small></div>
    <div class="kk-process-step"><span>02</span><i></i><strong>Hakediş</strong><small>Kesinti kanıtı</small></div>
    <div class="kk-process-step"><span>03</span><i></i><strong>Maliyet</strong><small>Satıcı girdisi</small></div>
    <div class="kk-process-step final"><span>04</span><i></i><strong>Sonuç</strong><small>Güven seviyesiyle</small></div>`;
  host.append(map);
}

function kkVisualKpis(){
  const kpis=[...document.querySelectorAll('#dashboard .v4-kpis .premium-kpi')];
  const icons=['↗','↩','%','₺','≋'];
  const names=['Satış','İade','Komisyon','Kalan','Hareket'];
  kpis.forEach((card,index)=>{
    if(card.querySelector('.kk-kpi-glyph'))return;
    const glyph=document.createElement('span');
    glyph.className='kk-kpi-glyph';
    glyph.setAttribute('aria-hidden','true');
    glyph.textContent=icons[index]||'•';
    card.prepend(glyph);
    card.dataset.visualLabel=names[index]||'';
    const rail=document.createElement('span');
    rail.className='kk-kpi-rail';
    card.append(rail);
  });
}

function kkVisualEvidence(){
  const card=document.querySelector('.kk-evidence-card');
  const list=document.getElementById('kkEvidenceList');
  if(!card||!list)return;
  let visual=card.querySelector('.kk-confidence-visual');
  if(!visual){
    visual=document.createElement('div');
    visual.className='kk-confidence-visual';
    visual.innerHTML=`<div class="kk-confidence-ring" id="kkConfidenceRing"><div><strong id="kkConfidenceNumber">—</strong><small>veri güveni</small></div></div><div class="kk-confidence-radar"><svg id="kkEvidenceRadar" viewBox="0 0 180 150" role="img" aria-label="Finansal veri güveni bileşen görünümü"></svg></div>`;
    list.before(visual);
  }
  const rows=[...list.querySelectorAll('.kk-evidence-row')];
  const values=rows.map(row=>{
    const bar=row.querySelector('.kk-meter>i');
    const raw=parseFloat(bar?.style?.width||'');
    return Number.isFinite(raw)?Math.max(0,Math.min(100,raw)):null;
  });
  const applicable=values.filter(Number.isFinite);
  const title=document.getElementById('kkHealthTitle')?.textContent||'';
  const scoreMatch=title.match(/(\d{1,3})\s*\/\s*100/);
  const score=scoreMatch?Math.max(0,Math.min(100,Number(scoreMatch[1]))):(applicable.length?Math.round(applicable.reduce((a,b)=>a+b,0)/applicable.length):null);
  const ring=document.getElementById('kkConfidenceRing');
  const number=document.getElementById('kkConfidenceNumber');
  if(ring&&ring.dataset.score!==String(score??0)){
    ring.dataset.score=String(score??0);
    ring.style.setProperty('--kk-score-pct',`${score??0}%`);
  }
  if(number&&number.textContent!==(score==null?'—':String(score)))number.textContent=score==null?'—':String(score);
  kkVisualRadar(values);
}

function kkVisualRadar(values){
  const svg=document.getElementById('kkEvidenceRadar');if(!svg)return;
  const signature=values.map(value=>Number.isFinite(value)?Math.round(value):'x').join('|');
  if(svg.dataset.signature===signature)return;
  svg.dataset.signature=signature;
  svg.replaceChildren();
  const cx=90,cy=75,radius=56,count=Math.max(4,values.length||4);
  for(let level=1;level<=4;level++){
    const points=[];
    for(let i=0;i<count;i++){
      const angle=-Math.PI/2+(Math.PI*2*i/count),r=radius*level/4;
      points.push(`${cx+Math.cos(angle)*r},${cy+Math.sin(angle)*r}`);
    }
    svg.append(kkVisualSvg('polygon',{points:points.join(' '),class:'kk-radar-grid'}));
  }
  for(let i=0;i<count;i++){
    const angle=-Math.PI/2+(Math.PI*2*i/count);
    svg.append(kkVisualSvg('line',{x1:cx,y1:cy,x2:cx+Math.cos(angle)*radius,y2:cy+Math.sin(angle)*radius,class:'kk-radar-axis'}));
  }
  const points=[];
  for(let i=0;i<count;i++){
    const value=Number.isFinite(values[i])?values[i]:0,angle=-Math.PI/2+(Math.PI*2*i/count),r=radius*value/100;
    points.push(`${cx+Math.cos(angle)*r},${cy+Math.sin(angle)*r}`);
  }
  svg.append(kkVisualSvg('polygon',{points:points.join(' '),class:'kk-radar-value'}));
}

function kkVisualChart(){
  const host=document.getElementById('kkDailyChart');
  const svg=host?.querySelector('svg');
  if(!svg||svg.dataset.visualized==='1')return;
  const lines=[...svg.querySelectorAll('polyline')];
  if(!lines.length)return;
  svg.dataset.visualized='1';
  const defs=kkVisualSvg('defs');
  defs.innerHTML=`<linearGradient id="kkVisualSalesArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#79c7ff" stop-opacity=".24"/><stop offset="100%" stop-color="#79c7ff" stop-opacity="0"/></linearGradient><linearGradient id="kkVisualCashArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f2a65a" stop-opacity=".22"/><stop offset="100%" stop-color="#f2a65a" stop-opacity="0"/></linearGradient><filter id="kkVisualGlow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg.prepend(defs);
  const baseline=216;
  lines.slice(0,2).forEach((line,index)=>{
    const points=(line.getAttribute('points')||'').trim();if(!points)return;
    const coords=points.split(/\s+/),first=coords[0]?.split(',')[0],last=coords.at(-1)?.split(',')[0];
    const area=kkVisualSvg('polygon',{points:`${first},${baseline} ${points} ${last},${baseline}`,class:index===0?'kk-visual-area-sales':'kk-visual-area-cash'});
    line.parentNode.insertBefore(area,line);
    line.setAttribute('filter','url(#kkVisualGlow)');
    coords.forEach((point,pIndex)=>{
      if(pIndex!==coords.length-1&&pIndex%Math.max(1,Math.ceil(coords.length/7))!==0)return;
      const[x,y]=point.split(',');
      const dot=kkVisualSvg('circle',{cx:x,cy:y,r:pIndex===coords.length-1?4:2.4,class:index===0?'kk-visual-dot-sales':'kk-visual-dot-cash'});
      svg.append(dot);
    });
  });
}

function kkVisualEmptyStates(){
  document.querySelectorAll('.kk-chart-empty,.kk-live-empty,.kk-empty-box').forEach(box=>{
    if(box.querySelector('.kk-empty-mark'))return;
    const text=box.textContent.trim();
    if(!text||text.length>160)return;
    box.textContent='';
    const mark=document.createElement('span');mark.className='kk-empty-mark';mark.setAttribute('aria-hidden','true');
    mark.innerHTML='<i></i><i></i><i></i><i></i>';
    const copy=document.createElement('span');copy.className='kk-empty-copy';copy.textContent=text;
    box.append(mark,copy);
  });
}

function kkVisualFlow(){
  document.querySelectorAll('#kkFlowGrid .kk-flow-item').forEach((item,index)=>{
    if(index>0&&!item.querySelector('.kk-flow-connector')){
      const connector=document.createElement('i');connector.className='kk-flow-connector';connector.setAttribute('aria-hidden','true');item.prepend(connector);
    }
  });
}

function kkVisualLeakRadar(){
  const card=document.getElementById('kkLeakRadar'),list=document.getElementById('kkLeakList');if(!card||!list)return;
  let visual=card.querySelector('.kk-leak-visual');
  if(!visual){visual=document.createElement('div');visual.className='kk-leak-visual';visual.innerHTML='<div class="kk-leak-rings"><i></i><i></i><i></i><span class="kk-sweep"></span><b>K</b></div><div class="kk-leak-summary"><strong id="kkLeakCount">0 sinyal</strong><small>Konum görseli dekoratiftir; öncelik sırası aşağıdaki gerçek sinyallerden gelir.</small></div>';list.before(visual)}
  const count=list.querySelectorAll('.kk-live-row').length;
  if(visual.dataset.count===String(count))return;
  visual.dataset.count=String(count);
  const countEl=document.getElementById('kkLeakCount');if(countEl)countEl.textContent=`${count} sinyal`;
  const rings=visual.querySelector('.kk-leak-rings');
  rings?.querySelectorAll('.kk-leak-dot').forEach(dot=>dot.remove());
  const positions=[[28,28],[63,33],[45,48],[72,56],[31,66],[57,74]];
  for(let i=0;i<Math.min(count,positions.length);i++){
    const dot=document.createElement('em');dot.className='kk-leak-dot';
    dot.style.left=`${positions[i][0]}%`;dot.style.top=`${positions[i][1]}%`;
    rings?.append(dot);
  }
}

function kkVisualRun(){
  if(!document.querySelector('.kk-command-bar'))return false;
  kkVisualAuth();kkVisualCommand();kkVisualKpis();kkVisualEvidence();kkVisualChart();kkVisualEmptyStates();kkVisualFlow();kkVisualLeakRadar();
  return true;
}

function kkVisualBoot(){
  if(!kkVisualRun()){setTimeout(kkVisualBoot,120);return}
  if(kkVisualState.mounted)return;
  kkVisualState.mounted=true;
  const target=document.getElementById('appPanel')||document.body;
  kkVisualState.observer=new MutationObserver(()=>requestAnimationFrame(kkVisualRun));
  kkVisualState.observer.observe(target,{subtree:true,childList:true});
}

kkVisualBoot();
