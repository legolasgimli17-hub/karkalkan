(()=>{
  'use strict';

  const PREFIX='kk_funnel_v1_';
  const track=(name,data)=>{
    try{
      if(typeof window.va==='function') window.va('event',{name,data:data||{}});
    }catch(_){/* Analytics must never affect the product. */}
  };
  const once=(key,name,data)=>{
    try{
      const storageKey=PREFIX+key;
      if(sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey,'1');
    }catch(_){/* Session storage can be unavailable; still send the event. */}
    track(name,data);
  };
  const byId=id=>document.getElementById(id);

  document.querySelectorAll('a[href="#motor"],a[href="/#motor"]').forEach(link=>{
    link.addEventListener('click',()=>once('cta_motor','HeroCtaClicked',{target:'motor'}),{passive:true});
  });

  const motor=byId('motor');
  if(motor){
    const start=event=>{
      if(event.target&&event.target.matches('input,select')) once('profit_started','ProfitAnalysisStarted');
    };
    motor.addEventListener('input',start,{passive:true});
    motor.addEventListener('change',start,{passive:true});
  }

  const campaign=byId('kampanya');
  if(campaign){
    const start=event=>{
      if(event.target&&event.target.matches('input,select')) once('campaign_started','CampaignAnalysisStarted');
    };
    campaign.addEventListener('input',start,{passive:true});
    campaign.addEventListener('change',start,{passive:true});
  }

  const demo=byId('demoBtn');
  if(demo) demo.addEventListener('click',()=>once('demo_loaded','DemoLoaded'),{passive:true});

  const bulkFile=byId('bulkFile');
  if(bulkFile){
    bulkFile.addEventListener('change',()=>{
      const file=bulkFile.files&&bulkFile.files[0];
      if(!file) return;
      const ext=(file.name.split('.').pop()||'').toLowerCase();
      once('bulk_selected','BulkFileSelected',{format:ext==='xlsx'?'xlsx':'csv'});
    },{passive:true});
  }

  const bulkBody=byId('bulkBody');
  if(bulkBody){
    const detectCompleted=()=>{
      const rows=[...bulkBody.querySelectorAll('tr')];
      if(rows.some(row=>!row.querySelector('.empty')&&row.querySelectorAll('td').length>=8)){
        once('bulk_completed','BulkAnalysisCompleted');
      }
    };
    new MutationObserver(detectCompleted).observe(bulkBody,{childList:true,subtree:true});
    detectCompleted();
  }

  const exportBtn=byId('exportBtn');
  if(exportBtn) exportBtn.addEventListener('click',()=>{
    if(!exportBtn.disabled) track('BulkResultsExported');
  },{passive:true});

  const saveProfile=byId('saveProfileBtn');
  if(saveProfile) saveProfile.addEventListener('click',()=>track('ProfileSaveAttempted'),{passive:true});

  const saveScenario=byId('saveScenarioBtn');
  if(saveScenario) saveScenario.addEventListener('click',()=>track('ScenarioSaveAttempted'),{passive:true});
})();
