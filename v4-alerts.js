'use strict';

/* Financial truth + rule based alerts. Loaded after v4-enhance.js. */
const alertUi={panel:null,list:null,critical:null,warning:null,info:null,stoppage:null,cargo:null,cargoCoverage:null,knownCash:null};

function alertMoney(v,c='TRY'){return Number.isFinite(Number(v))?formatMoney(Number(v),c):'—'}
function alertPercent(v){return Number.isFinite(Number(v))?formatPercent(Number(v)):'—'}
function alertCreate(){
  const anchor=document.getElementById('financeTruthPanel')||document.querySelector('#dashboard .dashboard-split');
  if(!anchor||document.getElementById('ruleAlertPanel'))return;
  const panel=document.createElement('section');panel.id='ruleAlertPanel';panel.className='panel alert-panel top-gap';
  const head=document.createElement('div');head.className='panel-title-row';
  const copy=document.createElement('div'),ey=document.createElement('p'),title=document.createElement('h3'),note=document.createElement('span');
  ey.className='eyebrow';ey.textContent='EVIDENCE ALERTS';title.textContent='Finansal gerçeklik ve risk alarmları';note.className='muted';note.textContent='Kurallar açık eşiklerle çalışır; AI tahmini değildir.';copy.append(ey,title);head.append(copy,note);
  const truth=document.createElement('div');truth.className='alert-truth-grid';
  for(const [label,id,help] of [
    ['E-ticaret stopajı','alertStoppage','Other Financials · Stoppage net kesintisi'],
    ['Gerçek kargo faturası','alertCargo','Trendyol kargo fatura kalemleri toplamı'],
    ['Kargo dağıtım kapsamı','alertCargoCoverage','Sipariş → ürün eşleşmesiyle dağıtılabilen bölüm'],
    ['Bilinen kesinti sonrası nakit','alertKnownCash','Net kâr değildir; platform ücretleri + kargo + stopaj sonrası']
  ]){const card=document.createElement('div');card.className='alert-truth-card';const s=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');s.textContent=label;strong.id=id;strong.textContent='—';small.textContent=help;card.append(s,strong,small);truth.append(card)}
  const summary=document.createElement('div');summary.className='alert-summary';
  for(const [label,id,cls] of [['Kritik','alertCritical','critical'],['Uyarı','alertWarning','warning'],['Bilgi','alertInfo','info']]){const chip=document.createElement('div');chip.className=`alert-count ${cls}`;const strong=document.createElement('strong'),span=document.createElement('span');strong.id=id;strong.textContent='0';span.textContent=label;chip.append(strong,span);summary.append(chip)}
  const list=document.createElement('div');list.id='alertList';list.className='alert-list';const empty=document.createElement('p');empty.className='muted';empty.textContent='Alarm verisi bekleniyor.';list.append(empty);
  panel.append(head,truth,summary,list);anchor.after(panel);
  Object.assign(alertUi,{panel,list,critical:document.getElementById('alertCritical'),warning:document.getElementById('alertWarning'),info:document.getElementById('alertInfo'),stoppage:document.getElementById('alertStoppage'),cargo:document.getElementById('alertCargo'),cargoCoverage:document.getElementById('alertCargoCoverage'),knownCash:document.getElementById('alertKnownCash')});
}
function alertReset(){for(const el of [alertUi.stoppage,alertUi.cargo,alertUi.cargoCoverage,alertUi.knownCash])if(el)el.textContent='—';for(const el of [alertUi.critical,alertUi.warning,alertUi.info])if(el)el.textContent='0';if(alertUi.list){alertUi.list.replaceChildren();const p=document.createElement('p');p.className='muted';p.textContent='Alarm verisi bekleniyor.';alertUi.list.append(p)}}
function alertRender(data){
  const f=data?.financialTruth||{},counts=data?.counts||{},currency='TRY';
  if(alertUi.stoppage)alertUi.stoppage.textContent=alertMoney(f.stoppageNet,currency);
  if(alertUi.cargo)alertUi.cargo.textContent=alertMoney(f.cargoCost,currency);
  if(alertUi.cargoCoverage)alertUi.cargoCoverage.textContent=alertPercent(f.cargoAllocationCoverage);
  if(alertUi.knownCash)alertUi.knownCash.textContent=alertMoney(f.knownCashAfterFeesAndStoppage,currency);
  if(alertUi.critical)alertUi.critical.textContent=Number(counts.critical||0).toLocaleString('tr-TR');
  if(alertUi.warning)alertUi.warning.textContent=Number(counts.warning||0).toLocaleString('tr-TR');
  if(alertUi.info)alertUi.info.textContent=Number(counts.info||0).toLocaleString('tr-TR');
  if(!alertUi.list)return;alertUi.list.replaceChildren();const rows=Array.isArray(data?.alerts)?data.alerts:[];
  if(!rows.length){const p=document.createElement('p');p.className='alert-empty';p.textContent='Seçili dönemde kural tabanlı risk alarmı oluşmadı.';alertUi.list.append(p);return}
  for(const a of rows){const row=document.createElement('article');row.className=`alert-row ${['critical','warning','info'].includes(a.severity)?a.severity:'info'}`;const badge=document.createElement('span');badge.className='alert-badge';badge.textContent=a.severity==='critical'?'Kritik':a.severity==='warning'?'Uyarı':'Bilgi';const body=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=String(a.label||a.externalProductId||'Mağaza');small.textContent=String(a.message||'Risk sinyali');body.append(strong,small);row.append(badge,body);alertUi.list.append(row)}
}
async function loadRuleAlerts(){
  if(!activeConnectionId){alertReset();return}
  try{const days=Number(els?.rangeDays?.value||30),data=await functionRequest('risk-alerts',{query:{connection_id:activeConnectionId,days}});alertRender(data)}catch(e){if(alertUi.list){alertUi.list.replaceChildren();const p=document.createElement('p');p.className='alert-empty bad';p.textContent=`Alarm verisi alınamadı: ${humanError(e)}`;alertUi.list.append(p)}}
}

alertCreate();
const alertCoreRefresh=refreshConnectionData;refreshConnectionData=async function(){await alertCoreRefresh();await loadRuleAlerts()};
const alertCoreReset=resetDashboardOnly;resetDashboardOnly=function(){alertCoreReset();alertReset()};
if(typeof activeConnectionId==='string'&&activeConnectionId)loadRuleAlerts().catch(()=>{});
