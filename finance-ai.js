'use strict';

(() => {
  const STYLE_ID='karkalkan-finance-ai-style';
  const SECTION_ID='financeAi';
  const PRESETS=[
    'Bu dönemde kârı en çok ne bozuyor?',
    'Önce hangi finansal sızıntıyı incelemeliyim?',
    'En riskli ürünler hangileri ve neden?',
    'Veri güvenim karar vermek için yeterli mi?'
  ];

  function addStyle(){
    if(document.getElementById(STYLE_ID))return;
    const link=document.createElement('link');link.id=STYLE_ID;link.rel='stylesheet';link.href='/finance-ai.css?v=20260821';document.head.appendChild(link);
  }
  function requestFn(){
    if(typeof globalThis.functionRequest==='function')return globalThis.functionRequest;
    try{if(typeof functionRequest==='function')return functionRequest}catch{/* unavailable */}
    return null;
  }
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
  function connectionId(){return String(document.getElementById('connectionSelect')?.value||'').trim()}
  function days(){const n=Number(document.getElementById('rangeDays')?.value||30);return n===7?7:30}
  function humanError(code){
    const map={
      INVALID_CONNECTION:'Önce analiz edilecek mağazayı seç.',AI_QUESTION_REQUIRED:'Sorunu biraz daha açık yaz.',
      AI_INPUT_MAY_CONTAIN_PERSONAL_DATA:'Müşteri e-postası, IBAN, telefon veya benzeri kişisel veriyi AI sorusuna yazma.',
      DATA_TOO_LARGE:'Bu dönem AI bağlamına güvenli şekilde sığmıyor. Daha kısa dönem seç.',
      AI_CONTEXT_FAILED:'Finans kanıt paketi hazırlanamadı. Önce mağaza verisini yenile.',NOT_FOUND:'Seçili mağaza bulunamadı.'
    };return map[code]||'Finans analizi şu anda tamamlanamadı.';
  }
  function shell(){
    if(document.getElementById(SECTION_ID))return document.getElementById(SECTION_ID);
    const dashboard=document.getElementById('dashboard');if(!dashboard)return null;
    const section=document.createElement('section');section.id=SECTION_ID;section.className='section finance-ai-section';
    section.innerHTML=`<div class="finance-ai-shell">
      <div class="finance-ai-head"><div><p class="eyebrow">02 · KANITLI AI FİNANS ANALİSTİ</p><h2>Rakam uydurmayan finans asistanı</h2><p>KârKalkan önce finansı kendi deterministic motorunda hesaplar. AI yalnız bu kanıt paketini açıklar; ham sipariş, müşteri veya bağlantı anahtarı modele gönderilmez.</p></div><div class="finance-ai-badges"><span id="financeAiMode" class="finance-ai-badge">Hazırlanıyor</span><span id="financeAiConfidence" class="finance-ai-badge">Güven —</span></div></div>
      <div class="finance-ai-guardrails"><div><strong>Deterministic rakam</strong><span>Model finans hesabı yapmaz.</span></div><div><strong>Kanıt zorunlu</strong><span>Her bulgu kaynak ID taşır.</span></div><div><strong>PII dışarıda</strong><span>Ham sipariş/müşteri verisi gönderilmez.</span></div><div><strong>Aksiyon kontrollü</strong><span>AI geri döndürülemez finans işlemi yapmaz.</span></div></div>
      <div id="financeAiPresets" class="finance-ai-presets"></div>
      <form id="financeAiForm" class="finance-ai-form"><textarea id="financeAiQuestion" maxlength="500" placeholder="Örn. Bu dönemde kârı en çok hangi kesinti bozuyor?"></textarea><button id="financeAiAsk" type="submit">Kanıtla analiz et</button></form>
      <p class="finance-ai-note">Müşteri adı, e-posta, telefon, IBAN veya başka kişisel veri yazma. Bu alan finansal özet soruları içindir.</p>
      <div id="financeAiStatus" class="finance-ai-status finance-ai-hidden" role="status"></div>
      <div id="financeAiResult" class="finance-ai-result finance-ai-hidden"><article class="finance-ai-answer"><h3>Analiz</h3><p id="financeAiSummary" class="finance-ai-summary"></p><p id="financeAiConfidenceNote" class="finance-ai-confidence"></p><div id="financeAiFindings" class="finance-ai-list"></div><h3 style="margin-top:18px">Önerilen sıra</h3><div id="financeAiActions" class="finance-ai-list"></div><div id="financeAiUnanswered" class="finance-ai-unanswered finance-ai-hidden"></div><p id="financeAiDisclaimer" class="finance-ai-disclaimer"></p></article><aside class="finance-ai-evidence"><h3>Kanıt paketi</h3><div id="financeAiEvidence" class="finance-ai-evidence-grid"></div></aside></div>
    </div>`;
    dashboard.insertAdjacentElement('afterend',section);
    return section;
  }
  function setStatus(text,kind=''){
    const el=document.getElementById('financeAiStatus');if(!el)return;el.textContent=text;el.className=`finance-ai-status${kind?` ${kind}`:''}`;
  }
  function hideStatus(){document.getElementById('financeAiStatus')?.classList.add('finance-ai-hidden')}
  function evidenceMap(items){return new Map((Array.isArray(items)?items:[]).map(item=>[String(item.id),item]))}
  function citations(ids,map){return (Array.isArray(ids)?ids:[]).map(id=>{const item=map.get(String(id));if(!item)return '';return `<span class="finance-ai-citation" title="${escapeHtml(item.source)}">${escapeHtml(item.label)} · ${escapeHtml(item.value)}</span>`}).join('')}
  function renderItems(target,items,map,type){
    target.innerHTML=(Array.isArray(items)?items:[]).map(item=>`<div class="finance-ai-item"><div class="finance-ai-item-head"><strong>${escapeHtml(item.title)}</strong><span class="finance-ai-severity ${escapeHtml(type==='finding'?item.severity:item.priority==='now'?'high':item.priority==='next'?'medium':'low')}">${escapeHtml(type==='finding'?item.severity:item.priority)}</span></div><p>${escapeHtml(type==='finding'?item.explanation:item.reason)}</p><div class="finance-ai-citations">${citations(item.evidenceIds,map)}</div></div>`).join('')||'<p class="finance-ai-note">Bu bölüm için ek bulgu yok.</p>';
  }
  function render(data){
    const analysis=data?.analysis||{},map=evidenceMap(data?.evidence);
    document.getElementById('financeAiMode').textContent=data.mode==='ai_with_evidence'?`AI + kanıt · ${data.model||'model'}`:'Kanıt motoru · AI yedeği';
    document.getElementById('financeAiMode').className=`finance-ai-badge ${data.mode==='ai_with_evidence'?'good':'warn'}`;
    document.getElementById('financeAiConfidence').textContent=`Güven ${Number(data.confidenceScore||0)}/100`;
    document.getElementById('financeAiConfidence').className=`finance-ai-badge ${Number(data.confidenceScore||0)>=70?'good':'warn'}`;
    document.getElementById('financeAiSummary').textContent=analysis.summary||'—';
    document.getElementById('financeAiConfidenceNote').textContent=analysis.confidenceNote||'';
    renderItems(document.getElementById('financeAiFindings'),analysis.findings,map,'finding');
    renderItems(document.getElementById('financeAiActions'),analysis.actions,map,'action');
    const unanswered=document.getElementById('financeAiUnanswered');
    if(analysis.unanswered){unanswered.textContent=analysis.unanswered;unanswered.classList.remove('finance-ai-hidden')}else unanswered.classList.add('finance-ai-hidden');
    document.getElementById('financeAiEvidence').innerHTML=[...map.values()].map(item=>`<div class="finance-ai-evidence-row"><span>${escapeHtml(item.label)}<br><small>${escapeHtml(item.source)}</small></span><strong>${escapeHtml(item.value)}</strong></div>`).join('');
    document.getElementById('financeAiDisclaimer').textContent=data.disclaimer||'';
    document.getElementById('financeAiResult').classList.remove('finance-ai-hidden');
    if(data.warning==='AI_NOT_CONFIGURED')setStatus('AI sağlayıcısı henüz yapılandırılmamış; ekranda görülen yorum KârKalkan’ın deterministic kanıt motorundan üretildi.','good');
    else if(data.warning)setStatus('AI servisi güvenli yedeğe düştü; model cevabı yerine deterministic kanıt yorumu gösteriliyor.','good');
    else setStatus('Analiz yalnız doğrulanmış KârKalkan kanıtlarına bağlı olarak üretildi.','good');
  }
  async function ask(question){
    const fn=requestFn();if(!fn){setStatus('Uygulama API katmanı hazır değil.','bad');return}
    const id=connectionId();if(!id){setStatus('Önce bir mağaza seç.','bad');return}
    const button=document.getElementById('financeAiAsk');button.disabled=true;button.textContent='Kanıt paketi hazırlanıyor…';
    document.getElementById('financeAiResult').classList.add('finance-ai-hidden');setStatus('Deterministic finans motoru ve veri güveni okunuyor…');
    try{const data=await fn('finance-ai',{method:'POST',body:{connection_id:id,days:days(),question}});render(data)}catch(error){setStatus(humanError(String(error?.message||'')),'bad')}finally{button.disabled=false;button.textContent='Kanıtla analiz et'}
  }
  function init(){
    addStyle();if(!shell())return;
    const presetRoot=document.getElementById('financeAiPresets'),question=document.getElementById('financeAiQuestion');
    PRESETS.forEach(text=>{const button=document.createElement('button');button.type='button';button.className='finance-ai-preset';button.textContent=text;button.addEventListener('click',()=>{question.value=text;void ask(text)});presetRoot.appendChild(button)});
    document.getElementById('financeAiForm')?.addEventListener('submit',event=>{event.preventDefault();const text=String(question.value||'').trim();if(text.length<3){setStatus('Sorunu biraz daha açık yaz.','bad');return}void ask(text)});
    document.getElementById('connectionSelect')?.addEventListener('change',()=>{document.getElementById('financeAiResult')?.classList.add('finance-ai-hidden');hideStatus()});
    document.getElementById('rangeDays')?.addEventListener('change',()=>{document.getElementById('financeAiResult')?.classList.add('finance-ai-hidden');hideStatus()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
