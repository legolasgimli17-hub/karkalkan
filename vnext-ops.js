'use strict';

/* Optional vNext operations layer: store expenses + multi-store portfolio. */
const kkOps={mounted:false};
const kkCategoryLabels={ads:'Reklam',packaging:'Paketleme',rent:'Kira',payroll:'Personel',software:'Yazılım / araçlar',other:'Diğer'};
function kkOpsMoney(v){const n=Number(v);if(!Number.isFinite(n))return'—';try{return new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(n)}catch{return `${Math.round(n).toLocaleString('tr-TR')} ₺`}}
function kkOpsEsc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function kkToday(){const d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${d.getFullYear()}-${m}-${day}`}
function kkMonthStart(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`}

function kkOpsMount(){
 if(kkOps.mounted)return true;
 const anchor=document.getElementById('kkLiveStream');if(!anchor)return false;
 kkOps.mounted=true;
 const nav=document.querySelector('.side-nav');if(nav&&!document.querySelector('a[href="#kkOperatingExpenses"]')){const a=document.createElement('a');a.href='#kkOperatingExpenses';a.innerHTML='<span>08</span> İşletme Giderleri';nav.append(a);const b=document.createElement('a');b.href='#kkPortfolio';b.innerHTML='<span>09</span> Mağaza Portföyü';nav.append(b)}
 const grid=document.createElement('div');grid.className='kk-ops-grid';grid.innerHTML=`
 <article id="kkOperatingExpenses" class="kk-ops-card">
   <div class="kk-card-head"><div><div class="kk-kicker">İşletme giderleri</div><h3>Ürün maliyetinden ayrı tut</h3><p>Reklam, kira, personel ve araç giderlerini döneme göre ekle. Kâr hesabına gizlice karıştırılmaz.</p></div><span class="kk-card-badge">Gider defteri</span></div>
   <div class="kk-ops-body">
    <div class="kk-ops-form">
      <div class="field"><label for="kkExpenseCategory">Tür</label><select id="kkExpenseCategory"><option value="ads">Reklam</option><option value="packaging">Paketleme</option><option value="rent">Kira</option><option value="payroll">Personel</option><option value="software">Yazılım / araçlar</option><option value="other">Diğer</option></select></div>
      <div class="field span-2"><label for="kkExpenseLabel">Açıklama</label><input class="input" id="kkExpenseLabel" maxlength="120" placeholder="Örn. Ağustos reklam bütçesi"></div>
      <div class="field"><label for="kkExpenseAmount">Tutar (₺)</label><input class="input" id="kkExpenseAmount" inputmode="decimal" placeholder="2500"></div>
      <div class="field"><label for="kkExpenseStart">Başlangıç</label><input class="input" id="kkExpenseStart" type="date"></div>
      <div class="field"><label for="kkExpenseEnd">Bitiş</label><input class="input" id="kkExpenseEnd" type="date"></div>
      <div class="kk-ops-actions span-2"><button id="kkExpenseSave" class="btn primary" type="button">Gideri kaydet</button></div>
    </div>
    <p id="kkExpenseMessage" class="kk-ops-note">Seçili mağazaya ait giderler tarih aralığına paylaştırılır; resmî muhasebe kaydı değildir.</p>
    <div id="kkExpenseList" class="kk-expense-list"><div class="kk-empty-box">Giderler yükleniyor.</div></div>
   </div>
 </article>
 <article id="kkPortfolio" class="kk-portfolio-card">
   <div class="kk-card-head"><div><div class="kk-kicker">Mağaza portföyü</div><h3>Tüm mağazaların tek finans görünümü</h3><p>Her mağazayı ayrı tut, toplamı birlikte gör. İşletme giderleri de seçili döneme paylaştırılır.</p></div><span id="kkPortfolioBadge" class="kk-card-badge">Portföy</span></div>
   <div id="kkPortfolioSummary" class="kk-portfolio-summary"><div class="kk-empty-box" style="grid-column:1/-1">Portföy yükleniyor.</div></div>
   <div id="kkStoreList" class="kk-store-list"></div>
 </article>`;
 anchor.after(grid);
 document.getElementById('kkExpenseStart').value=kkMonthStart();document.getElementById('kkExpenseEnd').value=kkToday();
 document.getElementById('kkExpenseSave').addEventListener('click',kkSaveExpense);
 return true;
}

async function kkLoadExpenses(){
 const host=document.getElementById('kkExpenseList'),msg=document.getElementById('kkExpenseMessage');if(!host||!msg)return;
 if(!activeConnectionId){host.innerHTML='<div class="kk-empty-box">Önce mağaza seç.</div>';return}
 try{const data=await functionRequest('operating-expenses',{query:{connection_id:activeConnectionId}}),rows=Array.isArray(data?.expenses)?data.expenses:[];if(!rows.length){host.innerHTML='<div class="kk-empty-box">Henüz işletme gideri yok.</div>';return}host.innerHTML=rows.map(r=>`<div class="kk-expense-row"><div><strong>${kkOpsEsc(r.label)}</strong><small>${kkOpsEsc(kkCategoryLabels[r.category]||r.category)}</small></div><span>${kkOpsMoney(r.amount)}</span><small>${kkOpsEsc(r.period_start)} → ${kkOpsEsc(r.period_end)}</small><button class="kk-expense-delete" type="button" data-expense-id="${kkOpsEsc(r.id)}">Sil</button></div>`).join('');host.querySelectorAll('[data-expense-id]').forEach(btn=>btn.addEventListener('click',()=>kkDeleteExpense(btn.dataset.expenseId)))}catch(e){host.innerHTML=`<div class="kk-empty-box">Giderler alınamadı: ${kkOpsEsc(humanError(e))}</div>`}
}

async function kkSaveExpense(){
 const btn=document.getElementById('kkExpenseSave'),msg=document.getElementById('kkExpenseMessage');if(!btn||!msg||!activeConnectionId){if(msg)msg.textContent='Önce mağaza seç.';return}
 const category=document.getElementById('kkExpenseCategory').value,label=String(document.getElementById('kkExpenseLabel').value||'').trim(),amount=Number(String(document.getElementById('kkExpenseAmount').value||'').replace(',','.')),period_start=document.getElementById('kkExpenseStart').value,period_end=document.getElementById('kkExpenseEnd').value;
 if(!label||!Number.isFinite(amount)||amount<0||!period_start||!period_end||period_end<period_start){msg.textContent='Açıklama, geçerli tutar ve tarih aralığı gir.';return}
 btn.disabled=true;btn.textContent='Kaydediliyor…';try{await functionRequest('operating-expenses',{method:'POST',body:{action:'create',connection_id:activeConnectionId,category,label,amount,period_start,period_end}});document.getElementById('kkExpenseLabel').value='';document.getElementById('kkExpenseAmount').value='';msg.textContent='Gider kaydedildi; portföy görünümü dönem payını otomatik hesaplar.';await Promise.allSettled([kkLoadExpenses(),kkLoadPortfolio()])}catch(e){msg.textContent=humanError(e)}finally{btn.disabled=false;btn.textContent='Gideri kaydet'}
}

async function kkDeleteExpense(id){if(!activeConnectionId||!id)return;try{await functionRequest('operating-expenses',{method:'POST',body:{action:'delete',connection_id:activeConnectionId,id}});await Promise.allSettled([kkLoadExpenses(),kkLoadPortfolio()])}catch(e){const msg=document.getElementById('kkExpenseMessage');if(msg)msg.textContent=humanError(e)}}

async function kkLoadPortfolio(){
 const summary=document.getElementById('kkPortfolioSummary'),list=document.getElementById('kkStoreList'),badge=document.getElementById('kkPortfolioBadge');if(!summary||!list||!badge)return;
 try{const days=Number(els?.rangeDays?.value||30),data=await functionRequest('portfolio-summary',{query:{days}}),t=data?.totals||{},stores=Array.isArray(data?.stores)?data.stores:[];badge.textContent=`${Number(data?.storeCount||0)} mağaza`;summary.innerHTML=`<div class="kk-portfolio-kpi"><span>Toplam satış</span><strong>${kkOpsMoney(t.grossSales)}</strong><small>${days} günlük portföy</small></div><div class="kk-portfolio-kpi"><span>İşletme giderleri</span><strong>${kkOpsMoney(t.operatingExpenses)}</strong><small>Tarih aralığına dağıtılan gider</small></div><div class="kk-portfolio-kpi"><span>İşletme sonrası görünüm</span><strong>${kkOpsMoney(t.afterOperatingExpenses)}</strong><small>Vergi/muhasebe net kârı değildir</small></div>`;if(!stores.length){list.innerHTML='<div class="kk-empty-box">Henüz mağaza yok.</div>';return}list.innerHTML=stores.map(s=>`<div class="kk-store-row ${s.id===activeConnectionId?'active':''}"><div class="name"><strong>${kkOpsEsc(s.displayName||'Mağaza')}</strong><small>${kkOpsEsc(String(s.marketplace||'').toLocaleUpperCase('tr-TR'))} · ${kkOpsEsc(s.sellerId||'—')}</small></div><div class="kk-store-cell"><span>Satış</span><strong>${kkOpsMoney(s.grossSales)}</strong></div><div class="kk-store-cell"><span>Gider</span><strong>${kkOpsMoney(s.operatingExpenses)}</strong></div><div class="kk-store-cell"><span>İşletme sonrası</span><strong>${kkOpsMoney(s.afterOperatingExpenses)}</strong></div></div>`).join('')}catch(e){summary.innerHTML=`<div class="kk-empty-box" style="grid-column:1/-1">Portföy alınamadı: ${kkOpsEsc(humanError(e))}</div>`;list.innerHTML=''}
}

function kkOpsRefresh(){return Promise.allSettled([kkLoadExpenses(),kkLoadPortfolio()])}
function kkOpsBoot(){if(!kkOpsMount()){setTimeout(kkOpsBoot,120);return}kkOpsRefresh();if(typeof refreshConnectionData==='function'){const base=refreshConnectionData;refreshConnectionData=async function(){await base();await kkOpsRefresh()}}}
kkOpsBoot();
