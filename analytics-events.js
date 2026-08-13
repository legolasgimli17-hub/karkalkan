(()=>{
  'use strict';

  const sent=new Set();
  const track=(name,data)=>{
    try{
      if(typeof window.va==='function'){
        window.va('event',{name,data:data||{}});
      }
    }catch(_){/* analytics must never affect the app */}
  };
  const once=(key,name,data)=>{
    if(sent.has(key)) return;
    sent.add(key);
    track(name,data);
  };
  const on=(id,event,handler)=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener(event,handler,{passive:true});
  };

  const motor=document.getElementById('motor');
  if(motor){
    motor.addEventListener('input',()=>once('profit-start','ProfitAnalysisStarted'),{passive:true});
    motor.addEventListener('change',()=>once('profit-start','ProfitAnalysisStarted'),{passive:true});
  }

  const campaign=document.getElementById('kampanya');
  if(campaign){
    campaign.addEventListener('input',()=>once('campaign-start','CampaignAnalysisStarted'),{passive:true});
    campaign.addEventListener('change',()=>once('campaign-start','CampaignAnalysisStarted'),{passive:true});
  }

  on('demoBtn','click',()=>track('DemoLoaded'));
  on('saveProfileBtn','click',()=>track('ProfileSaveClicked'));
  on('saveScenarioBtn','click',()=>track('ScenarioSaveClicked'));
  on('downloadSampleBtn','click',()=>track('SampleCsvDownloaded'));
  on('exportBtn','click',()=>track('BulkResultsExported'));

  const bulk=document.getElementById('bulkFile');
  if(bulk){
    bulk.addEventListener('change',()=>{
      const file=bulk.files&&bulk.files[0];
      if(!file) return;
      const ext=(file.name.split('.').pop()||'').toLowerCase();
      const size=file.size<1024*1024?'<1MB':file.size<3*1024*1024?'1-3MB':'3MB+';
      track('BulkFileSelected',{format:ext==='xlsx'?'xlsx':'csv',size});
    },{passive:true});
  }

  document.querySelectorAll('.hero-actions a').forEach(a=>{
    a.addEventListener('click',()=>{
      const target=a.getAttribute('href')||'';
      if(target.includes('#motor')) track('HeroCtaClicked',{target:'motor'});
      else if(target.includes('#toplu')) track('HeroCtaClicked',{target:'bulk'});
      else if(target.includes('#kampanya')) track('HeroCtaClicked',{target:'campaign'});
    },{passive:true});
  });
})();
