'use strict';

(() => {
  const fallbackProviders=[
    {key:'trendyol',label:'Trendyol',tier:'ready',mode:'api',sellerIdLabel:'Satıcı numarası',sellerIdRequired:true,credentialFields:[{key:'api_key',label:'API Key'},{key:'api_secret',label:'API Secret'}],capabilities:['Sipariş V2','Finans hareketleri','Kargo','Otomatik eşitleme'],note:'Entegrasyon hazır; ilk yetkili mağazada gerçek veri doğrulaması bekliyor.'},
    {key:'hepsiburada',label:'Hepsiburada',tier:'ready',mode:'api',sellerIdLabel:'Merchant ID (UUID)',sellerIdRequired:true,credentialFields:[{key:'username',label:'Entegrasyon kullanıcı adı'},{key:'password',label:'Servis anahtarı'}],capabilities:['Finans hareketleri','Ürün kârlılığı','Komisyon ve kesintiler','Otomatik eşitleme'],note:'Entegrasyon hazır; ilk yetkili mağazada gerçek veri doğrulaması bekliyor.'},
    {key:'n11',label:'n11',tier:'ready',mode:'api',sellerIdLabel:'Satıcı ID',sellerIdRequired:false,credentialFields:[{key:'app_key',label:'API anahtarı'},{key:'app_secret',label:'API şifresi'}],capabilities:['Siparişler','Onaylı iadeler','Komisyon ve hizmet oranları','Otomatik eşitleme'],note:'Entegrasyon hazır; kargo ve son ekstre kesintileri n11 ödeme detay raporuyla tamamlanır, ilk yetkili mağaza doğrulaması bekliyor.'},
    {key:'amazon',label:'Amazon',tier:'gated',mode:'oauth',sellerIdLabel:'Seller ID',sellerIdRequired:false,credentialFields:[],capabilities:['Güvenli OAuth','Finances API 2024','Ürün kârlılığı','Otomatik eşitleme'],note:'OAuth ve finans senkron altyapısı hazır. Canlı bağlantı için Amazon uygulama kaydı, Finance and Accounting rolü ve satıcı izni gerekir.'},
    {key:'flo',label:'FLO',tier:'gated',mode:'file',sellerIdLabel:'Tedarikçi / mağaza ID',sellerIdRequired:true,credentialFields:[{key:'api_username',label:'API kullanıcı adı'},{key:'api_password',label:'API şifresi'}],capabilities:['Standart finans raporu','Partner API kimlik kasası','Mağazayı yeniden kurmadan API geçişi'],note:'FLO partner API erişimini mağaza bazında verir. Tedarikçi ID, API kullanıcı adı ve API şifresi hazır değilse standart finans raporuyla çalışın.'}
  ];
  const tierLabels={verified:'Canlı doğrulandı',ready:'Hazır · doğrulama bekliyor',beta:'Geliştiriliyor',gated:'Onay gerekli',import:'Rapor'};
  const providerInitials={trendyol:'ty',hepsiburada:'hb',n11:'n11',amazon:'a',flo:'flo'};
  const getProviders=()=>Array.isArray(providerCatalog)&&providerCatalog.length?providerCatalog:fallbackProviders;
  const getProvider=(key)=>getProviders().find((provider)=>provider.key===key)||fallbackProviders[0];
  const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  const money=(value)=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:0}).format(Number(value)||0);
  const byId=(id)=>document.getElementById(id);
  let parsedImportRows=[];
  let billingLoading=false;

  function updateProviderForm(key){
    const provider=getProvider(key);
    if(els.marketplaceSelect&&els.marketplaceSelect.value!==provider.key)els.marketplaceSelect.value=provider.key;
    const label=byId('sellerIdLabel'),help=byId('providerHelp');
    if(label)label.textContent=`${provider.sellerIdLabel}${provider.sellerIdRequired?'':' (isteğe bağlı)'}`;
    if(help)help.textContent=provider.note;
    if(els.sellerId){els.sellerId.inputMode=provider.key==='trendyol'?'numeric':'text';els.sellerId.placeholder=provider.key==='trendyol'?'123456':provider.sellerIdLabel;}
    document.querySelectorAll('.provider-card').forEach((card)=>card.classList.toggle('active',card.dataset.provider===provider.key));
  }

  function renderProviders(){
    const root=byId('providerCatalog');
    if(!root)return;
    root.innerHTML=getProviders().map((provider)=>`<button class="provider-card ${provider.key===(els.marketplaceSelect?.value||'trendyol')?'active':''}" type="button" data-provider="${escapeHtml(provider.key)}"><span class="provider-state ${escapeHtml(provider.tier)}">${escapeHtml(tierLabels[provider.tier]||provider.tier)}</span><span class="provider-logo">${escapeHtml(providerInitials[provider.key]||provider.label.slice(0,2))}</span><strong>${escapeHtml(provider.label)}</strong><small>${escapeHtml(provider.note)}</small></button>`).join('');
  }

  function renderActiveProvider(connection,provider){
    provider=provider||getProvider(connection?.marketplace||'trendyol');
    const capabilities=byId('activeProviderCapabilities');
    if(capabilities)capabilities.innerHTML=(provider.capabilities||[]).map((item)=>`<span>${escapeHtml(item)}</span>`).join('');
    const title=byId('credentialTitle'),description=byId('credentialDescription'),note=byId('credentialNote'),keyLabel=byId('apiKeyLabel'),secretLabel=byId('apiSecretLabel'),panel=document.querySelector('.credential-panel');
    if(title)title.textContent=`${provider.label} veri erişimi`;
    if(description)description.textContent=provider.mode==='file'?'Standart raporla hemen başlayın; partner API erişimi açıldığında mağazayı yeniden kurmadan devam edin.':provider.mode==='oauth'?'Amazon izni güvenli OAuth ekranında verilir; satıcı şifresi KârKalkan’a girilmez.':'Kimlik bilgileri tarayıcıda tutulmaz; sunucu tarafındaki şifreli kasaya yazılır.';
    if(note)note.textContent=provider.note;
    const fields=provider.credentialFields||[];
    if(keyLabel)keyLabel.textContent=fields[0]?.label||'Harici yetkilendirme';
    if(secretLabel)secretLabel.textContent=fields[1]?.label||'Bu kanalda manuel anahtar yok';
    panel?.classList.toggle('is-gated',!fields.length);
    if(els.saveCredentialsBtn)els.saveCredentialsBtn.hidden=!fields.length;
    const oauthButton=byId('oauthConnectBtn');
    if(oauthButton)oauthButton.hidden=provider.key!=='amazon';
    if(els.syncBtn)els.syncBtn.textContent=provider.key==='trendyol'?'Trendyol’u eşitle':provider.key==='hepsiburada'?'Hepsiburada’yı eşitle':provider.key==='n11'?'n11’i eşitle':provider.key==='amazon'?'Amazon’u eşitle':'Raporla veri getir';
  }

  function renderCredentialState(connection,value){
    const provider=getProvider(connection?.marketplace||'trendyol');
    renderActiveProvider(connection,provider);
    const oauthButton=byId('oauthConnectBtn');
    if(oauthButton&&provider.key==='amazon')oauthButton.textContent=value?.configured?'Amazon iznini yenile':'Amazon’a güvenli bağlan';
    if(value?.actionRequired&&els.credentialMessage)setNotice(els.credentialMessage,value.actionRequired,provider.mode==='file'?'good':'');
  }

  function csvLine(values){return values.map((value)=>{const text=String(value??'');return /[",\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;}).join(',');}
  function downloadTemplate(){
    const header=['day','external_product_id','sku','product_name','sales_units','return_units','gross_sales','gross_returns','commission_cost','discount_cost','coupon_cost','seller_revenue'];
    const example=['2026-08-18','8690000000001','SKU-001','Örnek ürün','3','1','1497.00','499.00','179.64','0','0','818.36'];
    const blob=new Blob([`${csvLine(header)}\n${csvLine(example)}\n`],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='karkalkan-finans-raporu-sablonu.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function parseCsvRecord(line,delimiter){const result=[];let value='',quoted=false;for(let index=0;index<line.length;index++){const character=line[index];if(character==='"'){if(quoted&&line[index+1]==='"'){value+='"';index++;}else quoted=!quoted;}else if(character===delimiter&&!quoted){result.push(value.trim());value='';}else value+=character;}result.push(value.trim());return result;}
  function parseNumber(value){const normalized=String(value??'').trim().replace(/\s/g,'').replace(',','.');const number=Number(normalized);return Number.isFinite(number)?number:NaN;}
  function parseImportCsv(raw){
    const lines=String(raw).replace(/^\uFEFF/,'').split(/\r?\n/).filter((line)=>line.trim());
    if(lines.length<2)throw new Error('CSV en az bir veri satırı içermeli.');
    const delimiter=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';
    const headers=parseCsvRecord(lines[0],delimiter).map((item)=>item.toLowerCase());
    const required=['day','external_product_id','sales_units','gross_sales'];
    const missing=required.filter((name)=>!headers.includes(name));if(missing.length)throw new Error(`Eksik sütun: ${missing.join(', ')}`);
    if(lines.length-1>5000)throw new Error('Tek dosyada en fazla 5.000 satır yüklenebilir.');
    return lines.slice(1).map((line,index)=>{const cells=parseCsvRecord(line,delimiter),read=(name)=>cells[headers.indexOf(name)]??'';const row={day:read('day'),external_product_id:read('external_product_id'),sku:read('sku'),product_name:read('product_name'),sales_units:parseNumber(read('sales_units')),return_units:parseNumber(read('return_units')||0),gross_sales:parseNumber(read('gross_sales')),gross_returns:parseNumber(read('gross_returns')||0),commission_cost:parseNumber(read('commission_cost')||0),discount_cost:parseNumber(read('discount_cost')||0),coupon_cost:parseNumber(read('coupon_cost')||0)};const suppliedRevenue=read('seller_revenue');if(suppliedRevenue!=='')row.seller_revenue=parseNumber(suppliedRevenue);if(!/^\d{4}-\d{2}-\d{2}$/.test(row.day)||!row.external_product_id||Object.entries(row).some(([key,value])=>typeof value==='number'&&!Number.isFinite(value)))throw new Error(`${index+2}. satır geçersiz.`);return row;});
  }
  async function handleImportFile(file){
    const preview=byId('marketplaceImportPreview'),button=byId('runMarketplaceImportBtn');parsedImportRows=[];button.disabled=true;
    if(!file){preview.textContent='Henüz dosya seçilmedi.';return;}
    if(file.size>2_500_000){preview.textContent='Dosya 2,5 MB sınırını aşıyor.';return;}
    try{parsedImportRows=parseImportCsv(await file.text());const days=[...new Set(parsedImportRows.map((row)=>row.day))].sort();preview.textContent=`${file.name} · ${parsedImportRows.length.toLocaleString('tr-TR')} satır · ${days[0]} → ${days.at(-1)} · yüklenen dönem mevcut dönemin yerini alacak.`;button.disabled=false;setNotice(byId('marketplaceImportMessage'));}catch(error){preview.textContent=error.message;setNotice(byId('marketplaceImportMessage'),'CSV şablonunu indirip sütun adlarını değiştirmeden doldurun.','bad');}
  }
  async function runImport(){
    const button=byId('runMarketplaceImportBtn'),message=byId('marketplaceImportMessage');if(!activeConnectionId)return setNotice(message,'Önce aktif mağaza seç.','bad');if(!parsedImportRows.length)return setNotice(message,'Önce geçerli CSV seç.','bad');
    setBusy(button,true,'İçe aktarılıyor…');setNotice(message,'Rapor finans motoruna aktarılıyor…');
    try{const data=await functionRequest('marketplace-import',{method:'POST',body:{connection_id:activeConnectionId,rows:parsedImportRows}});setNotice(message,`${Number(data.rows||0).toLocaleString('tr-TR')} hareket · ${Number(data.days||0)} gün · ${Number(data.products||0)} ürün işlendi.`,'good');parsedImportRows=[];byId('marketplaceImportFile').value='';byId('marketplaceImportPreview').textContent='Aktarım tamamlandı.';await loadConnections();}catch(error){setNotice(message,humanError(error),'bad');}finally{setBusy(button,false);button.disabled=!parsedImportRows.length;}
  }

  function billingStatusLabel(status){return {inactive:'Ücretsiz erişim',trialing:'Deneme aktif',active:'Aktif',past_due:'Ödeme bekliyor',paused:'Duraklatıldı',canceled:'İptal edildi'}[status]||status;}
  function renderBilling(data){
    const subscription=data.subscription||{},planKey=subscription.plan_key||'free',current=(data.plans||[]).find((plan)=>plan.key===planKey),name=byId('billingPlanName'),meta=byId('billingPlanMeta'),chip=byId('topPlanChip'),manage=byId('manageBillingBtn'),grid=byId('pricingGrid');
    const planName=current?.name||'Ücretsiz erişim';if(name)name.textContent=planName;if(chip)chip.textContent=`${planName} · ${billingStatusLabel(subscription.status)}`;
    const end=subscription.current_period_end?new Date(subscription.current_period_end).toLocaleDateString('tr-TR'):'';if(meta)meta.textContent=`${billingStatusLabel(subscription.status)}${end?` · dönem sonu ${end}`:''} · ${Number(data.usage?.stores||0)} bağlı mağaza`;
    if(manage)manage.hidden=!subscription.paddle_subscription_id;
    if(!grid)return;
    grid.innerHTML=(data.plans||[]).map((plan)=>{const isCurrent=plan.key===planKey&&['active','trialing','past_due','paused'].includes(subscription.status),recommended=plan.key==='growth',features=[`${plan.stores} mağazaya kadar`,`${Number(plan.orders).toLocaleString('tr-TR')} sipariş / ay`,'Kanıt tabanlı finans özeti',plan.key==='starter'?'Standart destek':'Öncelikli destek',plan.key==='scale'?'Ajans / ekip çalışma alanı':'CSV ve API veri yolları'];const disabled=!data.billingReady||!plan.checkoutConfigured||isCurrent;return `<article class="pricing-card ${recommended?'recommended':''} ${isCurrent?'current':''}">${recommended?'<span class="recommended-label">En çok seçilen</span>':''}<h3>${escapeHtml(plan.name)}</h3><p>${escapeHtml(plan.description)}</p><div class="pricing-price"><strong>${escapeHtml(money(plan.monthlyTry))}</strong><span>/ ay + vergi</span></div><ul class="pricing-features">${features.map((feature)=>`<li>${escapeHtml(feature)}</li>`).join('')}</ul><button class="btn ${recommended?'primary':'ghost'}" type="button" data-billing-plan="${escapeHtml(plan.key)}" ${disabled?'disabled':''}>${isCurrent?'Mevcut plan':data.billingReady&&plan.checkoutConfigured?'Planı seç':'Ödeme aktivasyonu bekleniyor'}</button><div class="billing-trust">Güvenli Paddle ödeme ekranı · İptal ve faturalar self-servis</div></article>`;}).join('');
    if(!data.billingReady)setNotice(byId('billingMessage'),'Planlar ve abonelik akışı hazır. Satışa açmak için Paddle ürün kimlikleri ve webhook anahtarı tanımlanmalı.');else setNotice(byId('billingMessage'));
  }
  async function loadBilling(){if(!session||billingLoading||byId('appPanel')?.classList.contains('hide'))return;billingLoading=true;try{renderBilling(await functionRequest('billing-summary'));}catch(error){const meta=byId('billingPlanMeta');if(meta)meta.textContent=`Abonelik bilgisi alınamadı: ${humanError(error)}`;}finally{billingLoading=false;}}
  async function startCheckout(plan,button){setBusy(button,true,'Güvenli ödeme açılıyor…');setNotice(byId('billingMessage'));try{const data=await functionRequest('billing-checkout',{method:'POST',body:{plan}});if(!String(data.checkoutUrl||'').startsWith('https://'))throw new Error('PADDLE_CHECKOUT_URL_MISSING');location.assign(data.checkoutUrl);}catch(error){setNotice(byId('billingMessage'),humanError(error),'bad');setBusy(button,false);}}
  async function openBillingPortal(button){setBusy(button,true,'Portal açılıyor…');try{const data=await functionRequest('billing-portal',{method:'POST',body:{}});if(!String(data.portalUrl||'').startsWith('https://'))throw new Error('PADDLE_PORTAL_URL_MISSING');location.assign(data.portalUrl);}catch(error){setNotice(byId('billingMessage'),humanError(error),'bad');setBusy(button,false);}}

  els.marketplaceSelect?.addEventListener('change',()=>updateProviderForm(els.marketplaceSelect.value));
  byId('providerCatalog')?.addEventListener('click',(event)=>{const card=event.target.closest('[data-provider]');if(card)updateProviderForm(card.dataset.provider);});
  byId('downloadImportTemplateBtn')?.addEventListener('click',downloadTemplate);
  byId('marketplaceImportFile')?.addEventListener('change',(event)=>handleImportFile(event.target.files?.[0]));
  byId('runMarketplaceImportBtn')?.addEventListener('click',runImport);
  byId('pricingGrid')?.addEventListener('click',(event)=>{const button=event.target.closest('[data-billing-plan]');if(button&&!button.disabled)startCheckout(button.dataset.billingPlan,button);});
  byId('manageBillingBtn')?.addEventListener('click',(event)=>openBillingPortal(event.currentTarget));
  const observer=new MutationObserver(()=>{if(!byId('appPanel')?.classList.contains('hide'))loadBilling();});observer.observe(byId('appPanel'),{attributes:true,attributeFilter:['class']});
  window.KKSaleReady={renderProviders,renderActiveProvider,renderCredentialState,loadBilling};
  renderProviders();updateProviderForm(els.marketplaceSelect?.value||'trendyol');
  if(session&&!byId('appPanel')?.classList.contains('hide'))loadBilling();
})();
