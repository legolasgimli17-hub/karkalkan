'use strict';

(() => {
  const byId=(id)=>document.getElementById(id);
  const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  const providerLabels={trendyol:'Trendyol',hepsiburada:'Hepsiburada',n11:'n11',amazon:'Amazon',flo:'FLO'};
  const confidenceLabels={strong:'Güçlü aday',medium:'Orta aday',weak:'Zayıf aday'};
  let parsedRows=[];
  let loading=false;
  let loadedOnce=false;

  function csvLine(values){return values.map(value=>{const text=String(value??'');return /[",\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;}).join(',');}
  function downloadTemplate(){
    const header=['transaction_date','value_date','amount','currency','description','reference'];
    const example=['2026-08-18','2026-08-18','12540.80','TRY','TRENDYOL HAKEDIS ODEMESI','BANKA-REFERANSI-ORNEK'];
    const blob=new Blob([`${csvLine(header)}\n${csvLine(example)}\n`],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='karkalkan-banka-mutabakat-sablonu.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function parseCsv(raw,delimiter){
    const records=[];let record=[],value='',quoted=false;
    for(let index=0;index<raw.length;index++){
      const character=raw[index];
      if(character==='"'){if(quoted&&raw[index+1]==='"'){value+='"';index++;}else quoted=!quoted;continue;}
      if(!quoted&&character===delimiter){record.push(value.trim());value='';continue;}
      if(!quoted&&(character==='\n'||character==='\r')){if(character==='\r'&&raw[index+1]==='\n')index++;record.push(value.trim());value='';if(record.some(cell=>cell!==''))records.push(record);record=[];continue;}
      value+=character;
    }
    if(quoted)throw new Error('Kapanmamış tırnak bulundu.');
    record.push(value.trim());if(record.some(cell=>cell!==''))records.push(record);
    return records;
  }
  function parseNumber(value){
    let text=String(value??'').trim().replace(/\s/g,'');
    if(text.includes(',')&&text.includes('.'))text=text.lastIndexOf(',')>text.lastIndexOf('.')?text.replaceAll('.','').replace(',','.'):text.replaceAll(',','');
    else if(text.includes(','))text=text.replace(',','.');
    const number=Number(text);return Number.isFinite(number)?number:NaN;
  }
  function parseStatement(raw,defaultCurrency){
    const text=String(raw).replace(/^\uFEFF/,'');
    const firstLine=text.split(/\r?\n/,1)[0]||'',delimiter=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?';':',';
    const records=parseCsv(text,delimiter);if(records.length<2)throw new Error('CSV en az bir hareket içermeli.');
    const headers=records[0].map(item=>item.toLocaleLowerCase('tr-TR').trim()),required=['transaction_date','amount'];
    const missing=required.filter(name=>!headers.includes(name));if(missing.length)throw new Error(`Eksik sütun: ${missing.join(', ')}`);
    if(records.length-1>5000)throw new Error('Tek dosyada en fazla 5.000 hareket yüklenebilir.');
    const seenCurrencies=new Set();
    const rows=records.slice(1).map((cells,index)=>{
      const read=(name)=>cells[headers.indexOf(name)]??'',transactionDate=read('transaction_date'),valueDate=read('value_date'),amount=parseNumber(read('amount')),currency=String(read('currency')||defaultCurrency).trim().toUpperCase();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)||valueDate&&!/^\d{4}-\d{2}-\d{2}$/.test(valueDate)||!Number.isFinite(amount)||amount===0||!/^[A-Z]{3}$/.test(currency))throw new Error(`${index+2}. satır geçersiz.`);
      seenCurrencies.add(currency);return{transaction_date:transactionDate,value_date:valueDate||null,amount,currency,description:read('description'),reference:read('reference')};
    });
    if(seenCurrencies.size>1)throw new Error('Tek dosyada tek para birimi kullanın.');
    return rows;
  }
  async function handleFile(file){
    parsedRows=[];byId('importBankStatementBtn').disabled=true;
    if(!file){byId('bankImportPreview').textContent='Henüz dosya seçilmedi.';return;}
    if(file.size>2_500_000){byId('bankImportPreview').textContent='Dosya 2,5 MB sınırını aşıyor.';return;}
    try{
      parsedRows=parseStatement(await file.text(),byId('bankCurrency').value);const dates=parsedRows.map(row=>row.transaction_date).sort(),credits=parsedRows.filter(row=>row.amount>0).length;
      byId('bankImportPreview').textContent=`${file.name} · ${parsedRows.length.toLocaleString('tr-TR')} hareket · ${credits.toLocaleString('tr-TR')} para girişi · ${dates[0]} → ${dates.at(-1)}`;
      byId('importBankStatementBtn').disabled=false;setNotice(byId('bankImportMessage'));
    }catch(error){byId('bankImportPreview').textContent=error.message;setNotice(byId('bankImportMessage'),'Şablonu indirip sütun adlarını değiştirmeden doldurun.','bad');}
  }
  function formatMoney(value,currency='TRY'){const number=Number(value);if(!Number.isFinite(number))return'—';try{return new Intl.NumberFormat('tr-TR',{style:'currency',currency,maximumFractionDigits:2}).format(number)}catch{return`${number.toLocaleString('tr-TR')} ${currency}`}}
  function formatDate(value){const date=new Date(`${String(value).slice(0,10)}T00:00:00`);return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('tr-TR',{day:'2-digit',month:'short',year:'numeric'});}
  function renderSummary(summary={}){byId('bankTransactionCount').textContent=Number(summary.transactions||0).toLocaleString('tr-TR');byId('bankCandidateCount').textContent=Number(summary.candidates||0).toLocaleString('tr-TR');byId('bankConfirmedCount').textContent=Number(summary.confirmed||0).toLocaleString('tr-TR');byId('bankUnmatchedCount').textContent=Number(summary.unmatched||0).toLocaleString('tr-TR');}
  function candidateHtml(transaction,candidate){
    if(!candidate)return`<td><span class="bank-no-candidate">Kanal/tutar eşiğini geçen aday yok.</span></td><td>—</td><td>—</td><td><span class="bank-no-candidate">Ekstre veya hakedişi elle kontrol edin.</span></td>`;
    const review=candidate.review,difference=Math.abs(Number(candidate.differenceAmount||0)),near=difference<=Math.max(.5,Math.abs(Number(candidate.bankAmount||0))*.001);
    const actions=review?`<span class="bank-review-state ${escapeHtml(review.status)}">${review.status==='confirmed'?'Onaylandı':'Reddedildi'}</span>`:`<div class="bank-review-actions"><button type="button" data-bank-review="confirmed" data-transaction-id="${escapeHtml(transaction.id)}" data-connection-id="${escapeHtml(candidate.connectionId)}" data-range-start="${escapeHtml(candidate.rangeStart)}" data-range-end="${escapeHtml(candidate.rangeEnd)}">Onayla</button><button type="button" data-bank-review="rejected" data-transaction-id="${escapeHtml(transaction.id)}" data-connection-id="${escapeHtml(candidate.connectionId)}" data-range-start="${escapeHtml(candidate.rangeStart)}" data-range-end="${escapeHtml(candidate.rangeEnd)}">Reddet</button></div>`;
    return`<td><div class="bank-candidate"><strong>${escapeHtml(candidate.displayName||providerLabels[candidate.marketplace]||candidate.marketplace)}</strong><span class="bank-confidence ${escapeHtml(candidate.confidence)}">${escapeHtml(confidenceLabels[candidate.confidence]||candidate.confidence)}</span><small>${formatDate(candidate.rangeStart)} – ${formatDate(candidate.rangeEnd)}${candidate.providerMatched?' · açıklama eşleşti':''}</small></div></td><td>${formatMoney(candidate.expectedAmount,transaction.currency)}</td><td><span class="bank-difference ${near?'near':''}">${formatMoney(candidate.differenceAmount,transaction.currency)}</span></td><td>${actions}</td>`;
  }
  function renderLedger(transactions=[]){
    const body=byId('bankLedgerBody');
    if(!transactions.length){body.innerHTML='<tr><td colspan="6" class="empty">Bu dönemde pozitif banka hareketi yok.</td></tr>';return;}
    body.innerHTML=transactions.map(transaction=>{const candidate=transaction.candidates?.find(item=>item.review?.status==='confirmed')||transaction.candidates?.find(item=>!item.review)||transaction.candidates?.[0]||null;return`<tr><td><div class="bank-transaction-cell"><strong>${formatMoney(transaction.amount,transaction.currency)}</strong><small>${formatDate(transaction.transactionDate)}</small></div></td><td><div class="bank-description">${escapeHtml(transaction.description||'Açıklama yok')}${transaction.providerHint?`<br><small>${escapeHtml(providerLabels[transaction.providerHint]||transaction.providerHint)} işareti</small>`:''}</div></td>${candidateHtml(transaction,candidate)}</tr>`;}).join('');
  }
  function renderImports(imports=[]){
    const host=byId('bankImportHistory');if(!imports.length){host.innerHTML='<div class="empty">Henüz ekstre aktarılmadı.</div>';return;}
    host.innerHTML=imports.map(item=>`<div class="bank-import-row"><div><span>Hesap</span><strong>${escapeHtml(item.account_label)}${item.account_last4?` · ••••${escapeHtml(item.account_last4)}`:''}</strong></div><div><span>Dönem</span><strong>${formatDate(item.period_start)} – ${formatDate(item.period_end)}</strong></div><div><span>Hareket</span><strong>${Number(item.row_count||0).toLocaleString('tr-TR')}</strong></div><div><span>Para birimi</span><strong>${escapeHtml(item.currency)}</strong></div><button class="bank-delete-import" type="button" data-bank-import-delete="${escapeHtml(item.id)}">Veriyi sil</button></div>`).join('');
  }
  async function loadBankData(){
    if(!session||byId('appPanel')?.classList.contains('hide')||loading)return;
    loading=true;byId('refreshBankBtn').disabled=true;
    try{const data=await functionRequest('bank-reconciliation',{query:{days:'90'}});renderSummary(data.summary);renderLedger(data.transactions||[]);renderImports(data.imports||[]);byId('bankLedgerDisclaimer').textContent=data.disclaimer||'';loadedOnce=true;}
    catch(error){byId('bankLedgerBody').innerHTML=`<tr><td colspan="6" class="empty">${escapeHtml(humanError(error))}</td></tr>`;}
    finally{loading=false;byId('refreshBankBtn').disabled=false;}
  }
  async function importStatement(){
    const label=String(byId('bankAccountLabel').value||'').trim(),last4=String(byId('bankAccountLast4').value||'').trim(),button=byId('importBankStatementBtn'),message=byId('bankImportMessage');
    if(!label)return setNotice(message,'Hesabı tanıyacağınız kısa bir etiket yazın.','bad');
    if(last4&&!/^[A-Za-z0-9]{2,4}$/.test(last4))return setNotice(message,'Son 4 alanına yalnızca 2–4 harf veya rakam girin.','bad');
    if(!parsedRows.length)return setNotice(message,'Önce geçerli bir CSV seçin.','bad');
    setBusy(button,true,'Maskeleniyor ve aktarılıyor…');setNotice(message,'Hassas açıklamalar maskeleniyor; eşleşme adayları hazırlanıyor.');
    try{const data=await functionRequest('bank-reconciliation',{method:'POST',body:{action:'import',account_label:label,account_last4:last4||null,currency:byId('bankCurrency').value,rows:parsedRows}});setNotice(message,`${Number(data.rows||0).toLocaleString('tr-TR')} hareket güvenli biçimde aktarıldı. Ham dosya ve tam hesap bilgisi saklanmadı.`,'good');parsedRows=[];byId('bankStatementFile').value='';byId('bankImportPreview').textContent='Aktarım tamamlandı.';await loadBankData();}
    catch(error){setNotice(message,humanError(error),'bad');}
    finally{setBusy(button,false);button.disabled=!parsedRows.length;}
  }
  async function reviewCandidate(button){
    const buttons=[...button.closest('.bank-review-actions').querySelectorAll('button')];buttons.forEach(item=>item.disabled=true);
    try{await functionRequest('bank-reconciliation',{method:'POST',body:{action:'review',status:button.dataset.bankReview,bank_transaction_id:button.dataset.transactionId,connection_id:button.dataset.connectionId,range_start:button.dataset.rangeStart,range_end:button.dataset.rangeEnd}});await loadBankData();}
    catch(error){setNotice(byId('bankImportMessage'),humanError(error),'bad');buttons.forEach(item=>item.disabled=false);}
  }
  async function deleteImport(button){
    button.disabled=true;button.textContent='Siliniyor…';
    try{await functionRequest('bank-reconciliation',{method:'POST',body:{action:'delete_import',import_id:button.dataset.bankImportDelete}});setNotice(byId('bankImportMessage'),'Ekstre aktarımı ve ona bağlı inceleme kararları silindi.','good');await loadBankData();}
    catch(error){setNotice(byId('bankImportMessage'),humanError(error),'bad');button.disabled=false;button.textContent='Veriyi sil';}
  }

  byId('downloadBankTemplateBtn')?.addEventListener('click',downloadTemplate);
  byId('bankStatementFile')?.addEventListener('change',event=>handleFile(event.target.files?.[0]));
  byId('bankCurrency')?.addEventListener('change',()=>{if(byId('bankStatementFile').files?.[0])handleFile(byId('bankStatementFile').files[0]);});
  byId('importBankStatementBtn')?.addEventListener('click',importStatement);
  byId('refreshBankBtn')?.addEventListener('click',loadBankData);
  byId('bankLedgerBody')?.addEventListener('click',event=>{const button=event.target.closest('[data-bank-review]');if(button)reviewCandidate(button);});
  byId('bankImportHistory')?.addEventListener('click',event=>{const button=event.target.closest('[data-bank-import-delete]');if(button)deleteImport(button);});
  const observer=new MutationObserver(()=>{if(!byId('appPanel')?.classList.contains('hide')&&!loadedOnce)loadBankData();});observer.observe(byId('appPanel'),{attributes:true,attributeFilter:['class']});
  window.KKBankReconciliation={load:loadBankData};
  if(session&&!byId('appPanel')?.classList.contains('hide'))loadBankData();
})();
