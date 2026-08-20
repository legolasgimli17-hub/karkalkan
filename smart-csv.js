'use strict';

(() => {
  const STYLE_ID='karkalkan-smart-csv-style';
  const SECTION_ID='smartCsv';
  const MAX_FILE_BYTES=2_500_000;
  const MAX_ROWS=5000;
  const CANONICAL=[
    ['','— Eşleme yok —'],['day','Tarih *'],['external_product_id','Ürün ID / Barkod *'],['sku','SKU'],['product_name','Ürün adı'],
    ['sales_units','Satış adedi *'],['return_units','İade adedi *'],['gross_sales','Brüt satış *'],['gross_returns','Brüt iade'],
    ['commission_cost','Komisyon'],['discount_cost','İndirim'],['coupon_cost','Kupon'],['seller_revenue','Satıcı hakedişi']
  ];
  const REQUIRED=new Set(['day','external_product_id','sales_units','return_units','gross_sales']);
  let parsed=null;
  let mapping=[];

  function addStyle(){if(document.getElementById(STYLE_ID))return;const link=document.createElement('link');link.id=STYLE_ID;link.rel='stylesheet';link.href='/smart-csv.css?v=20260821';document.head.appendChild(link)}
  function addNav(){const nav=document.querySelector('.side-nav');if(!nav||nav.querySelector('a[href="#smartCsv"]'))return;const ai=nav.querySelector('a[href="#financeAi"]')||nav.querySelector('a[href="#dashboard"]');const link=document.createElement('a');link.href='#smartCsv';link.innerHTML='<span>CSV</span> Akıllı eşleştirici';ai?.insertAdjacentElement('afterend',link)}
  function requestFn(){if(typeof globalThis.functionRequest==='function')return globalThis.functionRequest;try{if(typeof functionRequest==='function')return functionRequest}catch{}return null}
  function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
  function shell(){
    if(document.getElementById(SECTION_ID))return document.getElementById(SECTION_ID);
    const anchor=document.getElementById('financeAi')||document.getElementById('dashboard');if(!anchor)return null;
    const section=document.createElement('section');section.id=SECTION_ID;section.className='section smart-csv-section';
    section.innerHTML=`<div class="smart-csv-shell">
      <div class="smart-csv-head"><div><p class="eyebrow">AKILLI CSV EŞLEŞTİRİCİ</p><h2>Dağınık raporu KârKalkan şemasına çevir</h2><p>Dosya satırları tarayıcıda kalır. Eşleştirme servisine yalnız kolon adları ve sayısal/tarih oranları gider; kullanıcı onayı olmadan hiçbir finans kaydı içe aktarılmaz.</p></div><span id="smartCsvMode" class="smart-csv-chip">Dosya bekleniyor</span></div>
      <label class="smart-csv-drop"><strong>CSV dosyasını seç</strong><span>Virgül, noktalı virgül veya sekme ayracı; en fazla 5.000 veri satırı / 2.5 MB.</span><input id="smartCsvFile" type="file" accept=".csv,text/csv,text/plain"></label>
      <div class="smart-csv-privacy"><div><strong>Ham satırlar modele gitmez</strong><span>AI varsa yalnız kolon başlığı + tip oranı görür.</span></div><div><strong>Önce öneri, sonra onay</strong><span>Eşleme select alanlarından elle değiştirilebilir.</span></div><div><strong>Import deterministic</strong><span>Onaydan sonra mevcut marketplace-import doğrulayıcısı çalışır.</span></div></div>
      <div id="smartCsvStatus" class="smart-csv-status smart-csv-hidden" role="status"></div>
      <div id="smartCsvMapping" class="smart-csv-mapping smart-csv-hidden"><table class="smart-csv-table"><thead><tr><th>Kaynak kolon</th><th>Tip profili</th><th>KârKalkan alanı</th><th>Güven</th><th>Neden</th></tr></thead><tbody id="smartCsvMappingBody"></tbody></table></div>
      <div id="smartCsvPreview" class="smart-csv-preview smart-csv-hidden"></div>
      <div id="smartCsvActions" class="smart-csv-actions smart-csv-hidden"><span id="smartCsvMeta" class="smart-csv-meta"></span><button id="smartCsvPreviewBtn" type="button">Normalize önizleme</button><button id="smartCsvImportBtn" type="button">Onayla ve içe aktar</button></div>
      <p class="smart-csv-warning"><strong>Not:</strong> müşteri iletişim bilgileri, adres, banka hesabı veya vergi kimliği gibi kolonları finans şemasına eşleme. Bu araç yalnız mağaza finans özetleri içindir.</p>
    </div>`;
    anchor.insertAdjacentElement('afterend',section);return section;
  }
  function status(text,kind=''){const el=document.getElementById('smartCsvStatus');if(!el)return;el.textContent=text;el.className=`smart-csv-status${kind?` ${kind}`:''}`}
  function delimiterFor(line){const counts=[[',',(line.match(/,/g)||[]).length],[';',(line.match(/;/g)||[]).length],['\t',(line.match(/\t/g)||[]).length]];counts.sort((a,b)=>b[1]-a[1]);return counts[0][1]>0?counts[0][0]:','}
  function parseLine(line,delimiter){const out=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted;continue}if(char===delimiter&&!quoted){out.push(value);value='';continue}value+=char}out.push(value);return out}
  function parseCsv(text){
    const normalized=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');const lines=normalized.split('\n').filter(line=>line.trim()!=='');if(lines.length<2)throw new Error('CSV_EMPTY');
    const delimiter=delimiterFor(lines[0]),headers=parseLine(lines[0],delimiter).map(value=>value.trim());
    if(headers.length<2||headers.length>40||headers.some((h,i)=>!h||headers.indexOf(h)!==i))throw new Error('CSV_HEADERS_INVALID');
    const rows=[];for(let i=1;i<lines.length;i++){const values=parseLine(lines[i],delimiter);if(values.length!==headers.length)throw new Error(`CSV_COLUMN_COUNT_${i+1}`);const row={};headers.forEach((h,index)=>row[h]=values[index].trim());rows.push(row);if(rows.length>MAX_ROWS)throw new Error('CSV_TOO_MANY_ROWS')}
    return {delimiter,headers,rows};
  }
  function isDate(value){const s=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(s)||/^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/.test(s)}
  function numeric(value){let s=String(value??'').trim().replace(/\s/g,'').replace(/[₺$€£]/g,'');if(!s)return null;if(/^[-+]?\d{1,3}(\.\d{3})*,\d+$/.test(s))s=s.replace(/\./g,'').replace(',','.');else if(/^[-+]?\d{1,3}(,\d{3})*\.\d+$/.test(s))s=s.replace(/,/g,'');else if(/^[-+]?\d+,\d+$/.test(s))s=s.replace(',','.');else s=s.replace(/,/g,'');const n=Number(s);return Number.isFinite(n)?n:null}
  function profiles(data){const sample=data.rows.slice(0,120);return data.headers.map(name=>{let non=0,num=0,date=0;for(const row of sample){const value=String(row[name]??'').trim();if(!value)continue;non++;if(numeric(value)!==null)num++;if(isDate(value))date++}const base=sample.length||1;return {name,numericRatio:num/base,dateRatio:date/base,nonEmptyRatio:non/base}})}
  function targetLabel(value){return CANONICAL.find(([key])=>key===value)?.[1]||value}
  function renderMappings(result){
    mapping=(result.mappings||[]).map(item=>({...item}));const body=document.getElementById('smartCsvMappingBody');body.innerHTML='';
    const p=profiles(parsed);for(const item of mapping){const profile=p.find(x=>x.name===item.source)||{};const tr=document.createElement('tr');const options=CANONICAL.map(([key,label])=>`<option value="${esc(key)}"${key===(item.target||'')?' selected':''}>${esc(label)}</option>`).join('');tr.innerHTML=`<td><strong>${esc(item.source)}</strong></td><td>${Math.round((profile.numericRatio||0)*100)}% sayı · ${Math.round((profile.dateRatio||0)*100)}% tarih</td><td><select data-source="${esc(item.source)}">${options}</select></td><td><span class="smart-csv-confidence">${Math.round(Number(item.confidence||0)*100)}%</span></td><td>${esc(item.reason||'')}</td>`;body.appendChild(tr)}
    body.querySelectorAll('select').forEach(select=>select.addEventListener('change',()=>{const row=mapping.find(x=>x.source===select.dataset.source);if(row)row.target=select.value||null;document.getElementById('smartCsvPreview').classList.add('smart-csv-hidden')}));
    document.getElementById('smartCsvMapping').classList.remove('smart-csv-hidden');document.getElementById('smartCsvActions').classList.remove('smart-csv-hidden');document.getElementById('smartCsvMode').textContent=result.mode==='ai_assisted'?`AI destekli · ${result.model||'model'}`:'Deterministic eşleme';document.getElementById('smartCsvMode').className=`smart-csv-chip ${result.mode==='ai_assisted'?'good':'warn'}`;
    document.getElementById('smartCsvMeta').textContent=`${parsed.rows.length.toLocaleString('tr-TR')} satır · ${parsed.headers.length} kolon · ham satırlar eşleştirme servisine gönderilmedi`;
  }
  function selectedMap(){const map={};for(const item of mapping){if(item.target)map[item.target]=item.source}return map}
  function dateValue(value){const s=String(value||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);if(!m)return '';return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}
  function intValue(value){const n=numeric(value);return n===null||!Number.isInteger(n)||n<0?null:n}
  function amount(value,zero=true){if(String(value??'').trim()===''&&zero)return 0;const n=numeric(value);return n===null?null:Math.round(n*100)/100}
  function normalizedRows(){
    const map=selectedMap();for(const field of REQUIRED)if(!map[field])throw new Error(`MISSING_${field.toUpperCase()}`);const used=Object.values(map);if(new Set(used).size!==used.length)throw new Error('DUPLICATE_MAPPING');
    return parsed.rows.map((row,index)=>{const day=dateValue(row[map.day]),product=String(row[map.external_product_id]??'').trim(),sales=intValue(row[map.sales_units]),returns=intValue(row[map.return_units]),gross=amount(row[map.gross_sales],false);if(!day||!product||sales===null||returns===null||gross===null)throw new Error(`INVALID_NORMALIZED_ROW_${index+2}`);const getAmount=(field)=>map[field]?amount(row[map[field]],true):0;const output={day,external_product_id:product,sales_units:sales,return_units:returns,gross_sales:gross,gross_returns:getAmount('gross_returns'),commission_cost:getAmount('commission_cost'),discount_cost:getAmount('discount_cost'),coupon_cost:getAmount('coupon_cost')};if([output.gross_returns,output.commission_cost,output.discount_cost,output.coupon_cost].some(v=>v===null||v<0)||output.gross_sales<0)throw new Error(`INVALID_NORMALIZED_ROW_${index+2}`);if(map.sku)output.sku=String(row[map.sku]??'').trim().slice(0,180);if(map.product_name)output.product_name=String(row[map.product_name]??'').trim().slice(0,300);if(map.seller_revenue){const value=amount(row[map.seller_revenue],false);if(value===null)throw new Error(`INVALID_NORMALIZED_ROW_${index+2}`);output.seller_revenue=value}return output})
  }
  function preview(){try{const rows=normalizedRows().slice(0,5),keys=['day','external_product_id','sku','product_name','sales_units','return_units','gross_sales','gross_returns','commission_cost','discount_cost','coupon_cost','seller_revenue'];const html=`<table class="smart-csv-table"><thead><tr>${keys.map(k=>`<th>${esc(targetLabel(k))}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${keys.map(k=>`<td>${esc(row[k]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;const root=document.getElementById('smartCsvPreview');root.innerHTML=html;root.classList.remove('smart-csv-hidden');status('Önizleme yalnız ilk 5 normalize satırı gösteriyor. İçe aktarma henüz yapılmadı.','good')}catch(error){status(human(error),'bad')}}
  function human(error){const code=String(error?.message||error||'');if(code.startsWith('MISSING_'))return `Zorunlu alan eksik: ${targetLabel(code.slice(8).toLowerCase())}.`;if(code==='DUPLICATE_MAPPING')return 'Aynı kaynak kolonu birden fazla KârKalkan alanına eşleme.';if(code.startsWith('INVALID_NORMALIZED_ROW_'))return `Normalize edilemeyen veri satırı var (CSV satırı ${code.split('_').at(-1)}). Tarih/sayı biçimini kontrol et.`;const map={CSV_EMPTY:'CSV içinde başlık ve en az bir veri satırı olmalı.',CSV_HEADERS_INVALID:'CSV başlıkları boş/tekrarlı veya kolon sayısı geçersiz.',CSV_TOO_MANY_ROWS:'Tek dosyada en fazla 5.000 veri satırı destekleniyor.',INVALID_COLUMNS:'Kolon profili eşleştirilemedi.',RATE_LIMITED:'Akıllı eşleştirme saatlik kullanım sınırına ulaştı.'};return map[code]||'CSV işlemi tamamlanamadı.'}
  async function handleFile(file){
    if(!file)return;if(file.size>MAX_FILE_BYTES){status('Dosya 2.5 MB sınırını aşıyor.','bad');return}status('Dosya tarayıcıda ayrıştırılıyor…');document.getElementById('smartCsvMapping').classList.add('smart-csv-hidden');document.getElementById('smartCsvActions').classList.add('smart-csv-hidden');document.getElementById('smartCsvPreview').classList.add('smart-csv-hidden');
    try{parsed=parseCsv(await file.text());const fn=requestFn();if(!fn)throw new Error('API_UNAVAILABLE');const result=await fn('csv-schema-mapper',{method:'POST',body:{columns:profiles(parsed)}});renderMappings(result);status(result.mode==='ai_assisted'?'AI yalnız kolon adları ve tip oranlarıyla eşleme önerdi. Import için eşlemeleri kontrol edip onayla.':'AI sağlayıcısı kapalı/yedekte; güvenli deterministic eşleme önerildi. Import için eşlemeleri kontrol edip onayla.','good')}catch(error){status(human(error),'bad')}
  }
  async function doImport(){
    const connection=String(document.getElementById('connectionSelect')?.value||'').trim();if(!connection){status('Önce uygulamada bir mağaza bağlantısı seç.','bad');return}let rows;try{rows=normalizedRows()}catch(error){status(human(error),'bad');return}const button=document.getElementById('smartCsvImportBtn');button.disabled=true;button.textContent='İçe aktarılıyor…';status('Onaylanan eşleme deterministic import motoruna gönderiliyor…');try{const fn=requestFn();if(!fn)throw new Error('API_UNAVAILABLE');const result=await fn('marketplace-import',{method:'POST',body:{connection_id:connection,rows}});status(`${result.rows||rows.length} satır başarıyla içe aktarıldı. KârKalkan finans motoru artık bu normalize veriyi kullanabilir.`,'good');if(typeof globalThis.loadConnections==='function')void globalThis.loadConnections().catch(()=>{});if(typeof globalThis.refreshConnectionData==='function')void globalThis.refreshConnectionData().catch(()=>{})}catch(error){status(human(error?.message||error),'bad')}finally{button.disabled=false;button.textContent='Onayla ve içe aktar'}}
  function init(){addStyle();addNav();if(!shell())return;document.getElementById('smartCsvFile')?.addEventListener('change',event=>void handleFile(event.target.files?.[0]));document.getElementById('smartCsvPreviewBtn')?.addEventListener('click',preview);document.getElementById('smartCsvImportBtn')?.addEventListener('click',()=>void doImport())}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
