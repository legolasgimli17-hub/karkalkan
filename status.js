'use strict';

(() => {
  const SUPABASE_URL='https://ilybqwjhkxfzociyvpeg.supabase.co';
  const PUBLISHABLE_KEY='sb_publishable_tix7qkJot2-3Hvik5kZvFg_SCYaZuzV';
  const $=id=>document.getElementById(id);

  function setComponent(id,state){const el=$(id);if(!el)return;el.textContent=state==='operational'?'Çalışıyor':state==='degraded'?'Sorunlu':'Doğrulanamadı';el.dataset.state=state;const dot=el.parentElement?.querySelector('.trust-dot');if(dot){dot.classList.remove('good','warn');if(state==='operational')dot.classList.add('good');else dot.classList.add('warn')}}
  async function webHealth(){const response=await fetch('/api/health',{cache:'no-store'});if(!response.ok)throw new Error('WEB_HEALTH_FAILED');const body=await response.json();return body?.ok===true?'operational':'degraded'}
  async function backendHealth(){const response=await fetch(`${SUPABASE_URL}/functions/v1/public-health`,{headers:{apikey:PUBLISHABLE_KEY,Accept:'application/json'},cache:'no-store'});let body={};try{body=await response.json()}catch{}if(!response.ok&&response.status!==503)throw new Error('BACKEND_HEALTH_FAILED');return {status:body?.status==='operational'?'operational':'degraded',runtime:body?.components?.runtime==='operational'?'operational':'degraded',database:body?.components?.database==='operational'?'operational':'degraded',checkedAt:body?.checkedAt||null}}
  async function load(){const overall=$('overallStatus'),meta=$('statusCheckedAt');if(overall)overall.textContent='Kontrol ediliyor…';const [web,backend]=await Promise.allSettled([webHealth(),backendHealth()]);const webState=web.status==='fulfilled'?web.value:'unknown';const backendValue=backend.status==='fulfilled'?backend.value:null;setComponent('webStatus',webState);setComponent('runtimeStatus',backendValue?.runtime||'unknown');setComponent('databaseStatus',backendValue?.database||'unknown');const allGood=webState==='operational'&&backendValue?.runtime==='operational'&&backendValue?.database==='operational';const anyBad=webState==='degraded'||backendValue?.runtime==='degraded'||backendValue?.database==='degraded';if(overall)overall.textContent=allGood?'Tüm kontrol edilen bileşenler çalışıyor':anyBad?'En az bir bileşen sorunlu':'Durumun tamamı doğrulanamadı';if(meta){const stamp=backendValue?.checkedAt?new Date(backendValue.checkedAt):new Date();meta.textContent=`Son kontrol: ${stamp.toLocaleString('tr-TR')}. Bu sayfa geçmiş uptime veya SLA yüzdesi iddiasında bulunmaz.`}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void load(),{once:true});else void load();
})();
