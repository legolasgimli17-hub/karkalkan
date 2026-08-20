'use strict';

(() => {
  const STYLE_ID='karkalkan-smart-csv-style';
  const SECTION_ID='smartCsv';
  const MAX_FILE_BYTES=2_500_000;
  const MAX_ROWS=5000;
  const CANONICAL=[
    ['','— Eşleme yok —'],['day','Tarih *'],['external_product_id','Ürün ID / Barkod *'],['sku','SKU'],['product_name','Ürün adı'],
    ['sales_units','Satış adedi *'],['return_units','İade adedi'],['gross_sales','Brüt satış *'],['gross_returns','Brüt iade'],
    ['commission_cost','Komisyon'],['discount_cost','İndirim'],['coupon_cost','Kupon'],['seller_revenue','Satıcı hakedişi']
  ];
  const REQUIRED=new Set(['day','external_product_id','sales_units','gross_sales']);
  let parsed=null;
  let mapping=[];

  function addStyle(){if(document.getElementById(STYLE_ID))return;const link=document.createElement('link');link.id=STYLE_ID;link.rel='stylesheet';link.href='/smart-csv.css?v=20260821';document.head.appendChild(link)}
  function addNav(){const nav=document.querySelector('.side-nav');if(!nav||nav.querySelector('a[href="#smartCsv"]'))return;const anchor=nav.querySelector('a[href="#financeAi"]')||nav.querySelector('a[href="#dashboard"]');const link=document.createElement('a');link.href='#smartCsv';link.innerHTML='<span>CSV</span> Akıllı eşleştirici';anchor?.insertAdjacentElement('afterend',link)}
  function requestFn(){if(typeof globalThis.functionRequest==='function')return globalThis.functionRequest;try{if(typeof functionRequest==='function')return functionRequest}catch{}return null}
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
  function targetLabel(value){return CANONICAL.find(([key])=>key===value)?.[1]||value}
  function status(text,kind=''){const el=document.getElementById('smartCsvStatus');if(!el)return;el.textContent=text;el.className=`smart-csv-status${kind?` ${kind}`:''}`}
  function connectionId(){return String(document.getElementById('connectionSelect')?.value||'').trim()}
  function shell(){
    if(document.getElementById(SECTION_ID))return document.getElementById(SECTION_ID);
    const anchor=document.getElementById('financeAi')||document.getElementById('dashboard');if(!anchor)return null;
    const section=document.createElement('section');section.id=SECTION_ID;section.className='section smart-csv-section';
    section.innerHTML=`<div class="smart-csv-shell">
      <div class="smart-csv-head"><div><p class="eyebrow">AKILLI CSV EŞLEŞTİRİCİ</p><h2>Dağınık raporu KârKalkan şemasına çevir</h2><p>Dosya satırları tarayıcıda kalır. Eşleştirme servisine yalnız kolon adları ve tip oranları gider; kullanıcı onayı olmadan finans kaydı içe aktarılmaz.</p></div><span id="smartCsvMode" class="smart-csv-chip">Dosya bekleniyor</span></div>
      <label class="smart-csv-drop"><strong>CSV dosyasını seç</strong><span>Virgül, noktalı virgül veya sekme ayracı; en fazla 5.000 veri satırı / 2.5 MB.</span><input id="smartCsvFile" type="file" accept=".csv,text/csv,text/plain"></label>
      <div class="smart-csv-privacy"><div><strong>Ham satırlar modele gitmez</strong><span>AI varsa yalnız kolon başlığı + tip oranı görür.</span></div><div><strong>Önce öneri, sonra onay</strong><span>Eşleme elle değiştirilebilir.</span></div><div><strong>Import deterministic</strong><span>Onaydan sonra mevcut marketplace-import doğrulayıcısı çalışır.</span></div></div>
      <div id="smartCsvStatus" class="smart-csv-status smart-csv-hidden" role="status"></div>
      <div id="smartCsvMapping" class="smart-csv-mapping smart-csv-hidden"><table class="smart-csv-table"><thead><tr><th>Kaynak kolon</th><th>Tip profili</th><th>KârKalkan alanı</th><th>Güven</th><th>Neden</th></tr></thead><tbody id="smartCsvMappingBody"></tbody></table></div>
      <div id="smartCsvPreview" class="smart-csv-preview smart-csv-hidden"></div>
      <div id="smartCsvActions" class="smart-csv-actions smart-csv-hidden"><span id="smartCsvMeta" class="smart-csv-meta"></span><button id="smartCsvPreviewBtn" type="button">Normalize önizleme</button><button id="smartCsvImportBtn" type="button">Onayla ve içe aktar</button></div>
      <p class="smart-csv-warning"><strong>Not:</strong> müşteri iletişim bilgileri, adres, banka hesabı veya vergi kimliği gibi kolonları finans şemasına eşleme. Bu araç mağaza finans raporları içindir.</p>
    </div>`;
    anchor.insertAdjacentElement('afterend',section);return section;
  }

  function delimiterFrom(firstRecord){const options=[',',';','\t'];return options.map(char=>[char,(firstRecord.match(new RegExp(char==='\t'?'\\t':`\\${char}`,'g'))||[]).length]).sort((a,b)=>b[1]-a[1])[0]?.[0]||','}
  function firstLogicalRecord(text){let quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){i++;continue}quoted=!quoted}else if((c==='\n'||c==='\r')&&!quoted)return text.slice(0,i)}return text}
  function parseCsv(text){
    const source=String(text||'').replace(/^\uFEFF/,'');if(!source.trim())throw new Error('CSV_EMPTY');
    const delimiter=delimiterFrom(firstLogicalRecord(source));const records=[];let record=[],field='',quoted=false;
    for(let i=0;i<=source.length;i++){
      const c=i===source.length?'\n':source[i];
      if(c==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++}else quoted=!quoted;continue}
      if(c===delimiter&&!quoted){record.push(field);field='';continue}
      if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;record.push(field);field='';if(record.some(value=>String(value).trim()!==''))records.push(record);record=[];continue}
      field+=c;
    }
    if(quoted)throw new Error('CSV_QUOTES_INVALID');
    if(records.length<2)throw new Error('CSV_EMPTY');
    const headers=records[0].map(value=>String(value).trim());if(headers.length<2||headers.length>40||headers.some((h,i)=>!h||headers.indexOf(h)!==i))throw new Error('CSV_HEADERS_INVALID');
    const rows=[];for(let i=1;i<records.length;i++){if(records[i].length!==headers.length)throw new Error(`CSV_COLUMN_COUNT_${i+1}`);const row={};headers.forEach((h,index)=>row[h]=String(records[i][index]??'').trim());rows.push(row);if(rows.length>MAX_ROWS)throw new Error('CSV_TOO_MANY_ROWS')}
    return {delimiter,headers,rows};
  }
  function isDate(value){const s=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(s)||/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(s)}
  function numeric(value){let s=String(value??'').trim().replace(/\s/g,'').replace(/[₺$€£]/g,'');if(!s)return null;if(/^[-+]?\d{1,3}(\.\d{3})*,\d+$/.test(s))s=s.replace(/\./g,'').replace(',','.');else if(/^[-+]?\d{1,3}(,\d{3})*\.\d+$/.test(s))s=s.replace(/,/g,'');else if(/^[-+]?\d+,\d+$/.test(s))s=s.replace(',','.');else s=s.replace(/,/g,'');const n=Number(s);return Number.isFinite(n)?n:null}
  function profiles(data){const sample=data.rows.slice(0,120),base=sample.length||1;return data.headers.map(name=>{let non=0,num=0,date=0;for(const row of sample){const value=String(row[name]??'').trim();if(!value)continue;non++;if(numeric(value)!==null)num++;if(isDate(value))date++}return {name,numericRatio:num/base,dateRatio:date/base,nonEmptyRatio:non/base}})}
  function dateValue(value){const s=String(value||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(`${s}T12:00:00Z`)))return s;const m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);if(!m)return '';const out=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return Number.isNaN(Date.parse(`${out}T12:00:00Z`))?'':out}
  function intValue(value,defaultValue=0){if(String(value??'').trim()==='')return defaultValue;const n=numeric(value);return n===null||!Number.isInteger(n)||n<0?null:n}
  function amount(value,defaultValue=0){if(String(value??'').trim()==='')return defaultValue;const n=numeric(value);return n===null?null:Math.round(n*100)/100}
  function selectedMap(){const out={};for(const item of mapping)if(item.target)out[item.target]=item.source;return out}
  function normalizedRows(){
    if(!parsed)throw new Error('CSV_EMPTY');const map=selectedMap();for(const field of REQUIRED)if(!map[field])throw new Error(`MISSING_${field.toUpperCase()}`);const used=Object.values(map);if(new Set(used).size!==used.length)throw new Error('DUPLICATE_MAPPING');
    return parsed.rows.map((row,index)=>{
      const day=dateValue(row[map.day]),product=String(row[map.external_product_id]??'').trim(),sales=intValue(row[map.sales_units],null),returns=map.return_units?intValue(row[map.return_units],0):0,gross=amount(row[map.gross_sales],null);
      if(!day||!product||sales===null||returns===null||gross===null)throw new Error(`INVALID_NORMALIZED_ROW_${index+2}`);
      const getAmount=field=>map[field]?amount(row[map[field]],0):0;const output={day,external_product_id:product,sales_units:sales,return_units:returns,gross_sales:gross,gross_returns:getAmount('gross_returns'),commission_cost:getAmount('commission_cost'),discount_cost:getAmount('discount_cost'),coupon_cost:getAmount('coupon_cost')};
      if([output.gross_sales,output.gross_returns,output.commission_cost,output.discount_cost,output.coupon_cost].some(v=>v===null||v<0))throw new Error(`INVALID_NORMALIZED_ROW_${index+2}`);
      if(map.sku)output.sku=String(row[map.sku]??'').trim().slice(0,180);if(map.product_name)output.product_name=String(row[map.product_name]??'').trim().slice(0,300);if(map.seller_revenue){const value=amount(row[map.seller_revenue],null);if(value===null)throw new Error(`INVALID_NORMALIZED_ROW_${index+2}`);output.seller_revenue=value}return output;
    });
  }
  function human(error){const code=String(error?.message||error||'');if(code.startsWith('MISSING_'))return `Zorunlu alan eksik: ${targetLabel(code.slice(8).toLowerCase())}.`;if(code==='DUPLICATE_MAPPING')return 'Aynı kaynak kolonu birden fazla KârKalkan alanına eşleme.';if(code.startsWith('INVALID_NORMALIZED_ROW_'))return `Normalize edilemeyen veri satırı var (CSV satırı ${code.split('_').at(-1)}). Tarih/sayı biçimini kontrol et.`;if(code.startsWith('CSV_COLUMN_COUNT_'))return `CSV satır ${code.split('_').at(-1)} başlıklarla aynı kolon sayısında değil.`;const map={CSV_EMPTY:'CSV içinde başlık ve en az bir veri satırı olmalı.',CSV_HEADERS_INVALID:'CSV başlıkları boş/tekrarlı veya kolon sayısı geçersiz.',CSV_QUOTES_INVALID:'CSV içinde kapanmamış tırnak bulundu.',CSV_TOO_MANY_ROWS:'Tek dosyada en fazla 5.000 veri satırı destekleniyor.',INVALID_COLUMNS:'Kolon profili eşleştirilemedi.',INVALID_PAYLOAD:'Eşleştirme isteği reddedildi.',RATE_LIMITED:'Akıllı eşleştirme saatlik kullanım sınırına ulaştı.',IMPORT_FAILED:'Rapor içe aktarılamadı.'};return map[code]||'CSV işlemi tamamlanamadı.'}
  function renderMappings(result){
    mapping=(Array.isArray(result?.mappings)?result.mappings:[]).map(item=>({...item}));const body=document.getElementById('smartCsvMappingBody');body.innerHTML='';const p=profiles(parsed);
    for(const item of mapping){const profile=p.find(x=>x.name===item.source)||{};const tr=document.createElement('tr');const options=CANONICAL.map(([key,label])=>`<option value="${escapeHtml(key)}"${key===(item.target||'')?' selected':''}>${escapeHtml(label)}</option>`).join('');tr.innerHTML=`<td><strong>${escapeHtml(item.source)}</strong></td><td>${Math.round((profile.numericRatio||0)*100)}% sayı · ${Math.round((profile.dateRatio||0)*100)}% tarih</td><td><select data-source="${escapeHtml(item.source)}">${options}</select></td><td><span class="smart-csv-confidence">${Math.round(Number(item.confidence||0)*100)}%</span></td><td>${escapeHtml(item.reason||'')}</td>`;body.appendChild(tr)}
    body.querySelectorAll('select').forEach(select=>select.addEventListener('change',()=>{const row=mapping.find(x=>x.source===select.dataset.source);if(row)row.target=select.value||null;document.getElementById('smartCsvPreview').classList.add('smart-csv-hidden')}));
    document.getElementById('smartCsvMapping').classList.remove('smart-csv-hidden');document.getElementById('smartCsvActions').classList.remove('smart-csv-hidden');document.getElementById('smartCsvMode').textContent=result.mode==='ai_assisted'?`AI destekli · ${result.model||'model'}`:'Deterministic eşleme';document.getElementById('smartCsvMode').className=`smart-csv-chip ${result.mode==='ai_assisted'?'good':'warn'}`;document.getElementById('smartCsvMeta').textContent=`${parsed.rows.length.toLocaleString('tr-TR')} satır · ${parsed.headers.length} kolon · ham satırlar mapper servisine gönderilmedi`;
  }
  function preview(){try{const rows=normalizedRows().slice(0,5),keys=['day','external_product_id','sku','product_name','sales_units','return_units','gross_sales','gross_returns','commission_cost','discount_cost','coupon_cost','seller_revenue'];const html=`<table class="smart-csv-table"><thead><tr>${keys.map(k=>`<th>${escapeHtml(targetLabel(k))}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${keys.map(k=>`<td>${escapeHtml(row[k]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;const root=document.getElementById('smartCsvPreview');root.innerHTML=html;root.classList.remove('smart-csv-hidden');status('Önizleme ilk 5 normalize satırı gösteriyor. Henüz içe aktarım yapılmadı.','good')}catch(error){status(human(error),'bad')}}
  async function handleFile(file){
    if(!file)return;if(file.size>MAX_FILE_BYTES){status('Dosya 2.5 MB sınırını aşıyor.','bad');return}status('Dosya tarayıcıda ayrıştırılıyor…');document.getElementById('smartCsvMapping').classList.add('smart-csv-hidden');document.getElementById('smartCsvActions').classList.add('smart-csv-hidden');document.getElementById('smartCsvPreview').classList.add('smart-csv-hidden');
    try{parsed=parseCsv(await file.text());const fn=requestFn();if(!fn)throw new Error('API_UNAVAILABLE');const result=await fn('csv-schema-mapper',{method:'POST',body:{columns:profiles(parsed)}});renderMappings(result);status(result.mode==='ai_assisted'?'AI yalnız kolon adları ve tip oranlarıyla eşleme önerdi. Eşlemeleri kontrol edip onayla.':'Güvenli deterministic eşleme önerildi. AI readiness kapalıysa hiçbir kolon bilgisi harici modele gönderilmez.','good')}catch(error){status(human(error),'bad')}
  }
  async function doImport(){
    const id=connectionId();if(!id){status('Önce uygulamada bir mağaza bağlantısı seç.','bad');return}let rows;try{rows=normalizedRows()}catch(error){status(human(error),'bad');return}const button=document.getElementById('smartCsvImportBtn');button.disabled=true;button.textContent='İçe aktarılıyor…';status('Onaylanan eşleme deterministic import motoruna gönderiliyor…');
    try{const fn=requestFn();if(!fn)throw new Error('API_UNAVAILABLE');const result=await fn('marketplace-import',{method:'POST',body:{connection_id:id,rows}});status(`${Number(result.rows||rows.length).toLocaleString('tr-TR')} satır güvenli şekilde içe aktarıldı. Finans paneli yenileniyor…`,'good');if(typeof globalThis.refreshAll==='function')await globalThis.refreshAll()}catch(error){status(human(error),'bad')}finally{button.disabled=false;button.textContent='Onayla ve içe aktar'}
  }
  function init(){addStyle();addNav();if(!shell())return;document.getElementById('smartCsvFile')?.addEventListener('change',event=>void handleFile(event.target.files?.[0]));document.getElementById('smartCsvPreviewBtn')?.addEventListener('click',preview);document.getElementById('smartCsvImportBtn')?.addEventListener('click',()=>void doImport())}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
