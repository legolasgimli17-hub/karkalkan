'use strict';

const SUPABASE_URL = 'https://ilybqwjhkxfzociyvpeg.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_tix7qkJot2-3Hvik5kZvFg_SCYaZuzV';
const SESSION_KEY = 'karkalkan.v4.session';
const ACTIVE_CONNECTION_KEY = 'karkalkan.v4.activeConnection';

const $ = (id) => document.getElementById(id);
const els = {
  authPanel: $('authPanel'), authForm: $('authForm'), authEmail: $('authEmail'), authPassword: $('authPassword'),
  signInBtn: $('signInBtn'), signUpBtn: $('signUpBtn'), authMessage: $('authMessage'), appPanel: $('appPanel'), userEmail: $('userEmail'),
  refreshAllBtn: $('refreshAllBtn'), signOutBtn: $('signOutBtn'), marketplaceSelect: $('marketplaceSelect'), connectionName: $('connectionName'), sellerId: $('sellerId'),
  createConnectionBtn: $('createConnectionBtn'), connectionMessage: $('connectionMessage'), connectionSelect: $('connectionSelect'), connectionMeta: $('connectionMeta'),
  credentialState: $('credentialState'), apiKey: $('apiKey'), apiSecret: $('apiSecret'), saveCredentialsBtn: $('saveCredentialsBtn'), oauthConnectBtn: $('oauthConnectBtn'), credentialMessage: $('credentialMessage'),
  rangeDays: $('rangeDays'), syncBtn: $('syncBtn'), syncMessage: $('syncMessage'), healthState: $('healthState'), healthMeta: $('healthMeta'),
  confidenceState: $('confidenceState'), coverageMeta: $('coverageMeta'), grossSales: $('grossSales'), grossReturns: $('grossReturns'),
  commissionCost: $('commissionCost'), sellerRevenue: $('sellerRevenue'), transactions: $('transactions'), worstProducts: $('worstProducts'),
  costProductId: $('costProductId'), costAmount: $('costAmount'), costVat: $('costVat'), saveCostBtn: $('saveCostBtn'), costMessage: $('costMessage'),
  historyBody: $('historyBody')
};

let session = null;
let connections = [];
let providerCatalog = [];
let activeConnectionId = '';
let refreshPromise = null;

function setNotice(el, message = '', kind = '') {
  el.textContent = message;
  el.classList.remove('good', 'bad');
  if (kind) el.classList.add(kind);
}

function setBusy(button, busy, busyText = 'İşleniyor…') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.label || button.textContent;
    delete button.dataset.label;
  }
}

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function parseStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') return null;
    if (!data.user || typeof data.user.email !== 'string') return null;
    if (!Number.isFinite(Number(data.expires_at))) return null;
    return data;
  } catch {
    return null;
  }
}

function saveSession(data) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(data.expires_at) || now + Number(data.expires_in || 3600);
  session = {
    access_token: String(data.access_token || ''),
    refresh_token: String(data.refresh_token || ''),
    expires_at: expiresAt,
    user: { id: String(data.user?.id || ''), email: String(data.user?.email || '') }
  };
  if (!session.access_token || !session.refresh_token || !session.user.email) throw new Error('Geçersiz oturum yanıtı.');
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  session = null;
  connections = [];
  activeConnectionId = '';
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ACTIVE_CONNECTION_KEY);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: 'INVALID_SERVER_RESPONSE' }; }
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: options.method || 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });
  const data = await readJson(response);
  if (!response.ok) {
    const err = new Error(data?.msg || data?.message || data?.error_description || data?.error || `HTTP_${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

async function refreshSession() {
  if (!session?.refresh_token) throw new Error('Oturum bulunamadı.');
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const data = await authRequest('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } });
      saveSession(data);
      return session;
    } catch (error) {
      clearSession();
      renderSignedOut();
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function ensureAccessToken() {
  if (!session) throw new Error('Oturum açman gerekiyor.');
  const now = Math.floor(Date.now() / 1000);
  if (Number(session.expires_at) - now < 90) await refreshSession();
  return session.access_token;
}

async function functionRequest(name, options = {}, retried = false) {
  const token = await ensureAccessToken();
  const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : '';
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${encodeURIComponent(name)}${query}`, {
    method: options.method || 'GET',
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });
  const data = await readJson(response);
  if (response.status === 401 && !retried && session?.refresh_token) {
    await refreshSession();
    return functionRequest(name, options, true);
  }
  if (!response.ok) {
    const err = new Error(data?.error || data?.message || `HTTP_${response.status}`);
    err.status = response.status;
    err.payload = data;
    throw err;
  }
  return data;
}

function humanError(error) {
  const code = String(error?.message || 'UNKNOWN');
  const map = {
    'Invalid login credentials': 'Email veya şifre hatalı.',
    'Email not confirmed': 'Önce email adresini doğrulaman gerekiyor.',
    'User already registered': 'Bu email ile zaten hesap var.',
    'CONNECTION_EXISTS': 'Bu mağaza bağlantısı zaten eklenmiş.',
    'INVALID_SELLER_ID': 'Satıcı ID yalnızca rakamlardan oluşmalı.',
    'INVALID_HEPSIBURADA_MERCHANT_ID': 'Hepsiburada Merchant ID, tireli UUID biçiminde olmalı.',
    'INVALID_MARKETPLACE': 'Desteklenmeyen satış kanalı seçildi.',
    'INVALID_CREDENTIALS': 'Bağlantı alanlarını eksiksiz doldur.',
    'VAULT_READ_FAILED': 'Şifreli bağlantı durumu okunamadı.',
    'VAULT_WRITE_FAILED': 'Bağlantı bilgileri şifreli kasaya kaydedilemedi.',
    'INVALID_IMPORT_SIZE': 'Rapor 1–5.000 satır arasında olmalı.',
    'INVALID_IMPORT_ROW': 'Rapor satırlarından biri geçersiz. Şablondaki biçimi kullan.',
    'NEGATIVE_IMPORT_VALUE': 'Satış, iade ve kesinti sütunları pozitif tutar olmalı.',
    'IMPORT_FAILED': 'Rapor içe aktarılamadı. Dönem ve satırları kontrol et.',
    'BILLING_NOT_CONFIGURED': 'Güvenli ödeme hesabı henüz satışa açılmadı.',
    'SUBSCRIPTION_ALREADY_EXISTS': 'Aktif aboneliğin var; değişiklik için fatura portalını kullan.',
    'BILLING_CUSTOMER_NOT_FOUND': 'Henüz yönetilecek bir abonelik bulunmuyor.',
    'PADDLE_CHECKOUT_URL_MISSING': 'Güvenli ödeme bağlantısı oluşturulamadı.',
    'PADDLE_PORTAL_URL_MISSING': 'Fatura portalı açılamadı.',
    'CREDENTIALS_MISSING': 'Önce seçili mağazanın API bilgilerini kaydet.',
    'TRENDYOL_UNAUTHORIZED': 'Trendyol API bilgileri reddedildi. Anahtarları kontrol et.',
    'TRENDYOL_FORBIDDEN': 'Trendyol bu API erişimine izin vermedi.',
    'TRENDYOL_RATE_LIMIT': 'Trendyol istek limiti doldu. Bir süre sonra tekrar dene.',
    'HEPSIBURADA_UNAUTHORIZED': 'Hepsiburada kullanıcı adı veya servis anahtarı reddedildi.',
    'HEPSIBURADA_FORBIDDEN': 'Hepsiburada bu mağaza için muhasebe API erişimine izin vermedi.',
    'HEPSIBURADA_RATE_LIMIT': 'Hepsiburada istek limiti doldu. Bir süre sonra tekrar dene.',
    'HEPSIBURADA_CURRENCY_CONFLICT': 'Hepsiburada aynı sonuçta birden fazla para birimi döndürdü. Daha kısa dönem seç.',
    'UNSUPPORTED_CURRENCY': 'Bu sürüm yalnızca TRY finans kayıtlarını işler; farklı para birimi bulundu.',
    'HEPSIBURADA_NETWORK': 'Hepsiburada API bağlantısı kurulamadı. Bir süre sonra tekrar dene.',
    'HEPSIBURADA_BAD_JSON': 'Hepsiburada beklenmeyen bir yanıt döndürdü; hata kayda alındı.',
    'HEPSIBURADA_HTTP_ERROR': 'Hepsiburada finans servisi isteği tamamlayamadı.',
    'N11_UNAUTHORIZED': 'n11 API anahtarı veya API şifresi reddedildi.',
    'N11_FORBIDDEN': 'n11 bu mağaza için API erişimine izin vermedi.',
    'N11_RATE_LIMIT': 'n11 istek limiti doldu. Bir süre sonra tekrar dene.',
    'N11_NETWORK': 'n11 sipariş servisine bağlantı kurulamadı.',
    'N11_RETURN_NETWORK': 'n11 iade servisine bağlantı kurulamadı.',
    'N11_BAD_JSON': 'n11 sipariş servisi beklenmeyen bir yanıt döndürdü.',
    'N11_HTTP_ERROR': 'n11 sipariş servisi isteği tamamlayamadı.',
    'N11_RETURN_HTTP_ERROR': 'n11 iade servisi isteği tamamlayamadı.',
    'N11_RETURN_API_FAILED': 'n11 iade servisi işlemi reddetti.',
    'AMAZON_APP_NOT_CONFIGURED': 'Amazon teknik akışı hazır; yetkili işletme hesabının App ID ve LWA bilgileri henüz sunucuya tanımlanmadı.',
    'AMAZON_AUTH_REQUIRED': 'Önce Amazon’a güvenli OAuth bağlantısı kur.',
    'AMAZON_AUTH_START_FAILED': 'Amazon yetkilendirme işlemi başlatılamadı; hata güvenli şekilde kayda alındı.',
    'AMAZON_LOGIN_REQUEST_INVALID': 'Amazon giriş yönlendirmesi doğrulanamadı. Bağlantıyı uygulamadan yeniden başlat.',
    'AMAZON_LOGIN_HANDOFF_FAILED': 'Amazon izin akışı güvenli şekilde sürdürülemedi. Bağlantıyı yeniden başlat.',
    'AMAZON_OAUTH_CANCELLED': 'Amazon bağlantı izni tamamlanmadı.',
    'AMAZON_OAUTH_STATE_INVALID': 'Amazon bağlantı isteği geçersiz. Uygulamadan yeniden başlat.',
    'AMAZON_OAUTH_STATE_EXPIRED': 'Amazon bağlantı isteğinin süresi doldu. Uygulamadan yeniden başlat.',
    'AMAZON_OAUTH_STATE_FAILED': 'Amazon bağlantı isteği doğrulanamadı.',
    'AMAZON_OAUTH_RESPONSE_INVALID': 'Amazon eksik bir yetkilendirme yanıtı döndürdü.',
    'AMAZON_OAUTH_EXCHANGE_FAILED': 'Amazon izni güvenli erişim anahtarına dönüştürülemedi. Yeniden bağlanmayı dene.',
    'AMAZON_REAUTH_REQUIRED': 'Amazon izni geçersiz veya yenilenmeli. Amazon’a yeniden bağlan.',
    'AMAZON_FORBIDDEN': 'Amazon uygulamasında Finance and Accounting rolü veya bu mağaza için izin eksik.',
    'AMAZON_RATE_LIMIT': 'Amazon istek limiti doldu. Bir süre sonra tekrar dene.',
    'AMAZON_NETWORK': 'Amazon SP-API bağlantısı kurulamadı. Bir süre sonra tekrar dene.',
    'AMAZON_TOKEN_NETWORK': 'Amazon güvenli erişim servisine ulaşılamadı.',
    'AMAZON_TOKEN_HTTP_ERROR': 'Amazon güvenli erişim servisi isteği tamamlayamadı.',
    'AMAZON_TOKEN_BAD_JSON': 'Amazon güvenli erişim servisi beklenmeyen yanıt döndürdü.',
    'AMAZON_TOKEN_INVALID': 'Amazon güvenli erişim yanıtı geçersiz.',
    'AMAZON_BAD_JSON': 'Amazon finans servisi beklenmeyen yanıt döndürdü.',
    'AMAZON_HTTP_ERROR': 'Amazon finans servisi isteği tamamlayamadı.',
    'AMAZON_MARKETPLACE_MISMATCH': 'Amazon Türkiye dışında bir mağaza verisi döndü; veri güvenliği için işlem durduruldu.',
    'SYNC_IN_PROGRESS': 'Bu mağaza için zaten bir senkron çalışıyor.',
    'SYNC_TOO_LARGE': 'Senkron veri sınırını aştı. Daha kısa aralık dene.',
    'ORIGIN_NOT_ALLOWED': 'Bu sayfanın adresine backend erişim izni yok.',
    'UNAUTHORIZED': 'Oturum geçersiz veya süresi dolmuş.',
    'UNAUTHENTICATED': 'Oturum açman gerekiyor.',
    'DB_ERROR': 'Veri okunurken bir sunucu hatası oluştu.',
    'DB_READ_FAILED': 'Veri okunamadı.',
    'DB_WRITE_FAILED': 'Veri kaydedilemedi.',
    'SERVER_CONFIG': 'Sunucu yapılandırması eksik.',
    'SERVER_MISCONFIGURED': 'Sunucu yapılandırması eksik.'
  };
  return map[code] || code.replaceAll('_', ' ').toLocaleLowerCase('tr-TR');
}

function renderSignedOut() {
  els.authPanel.classList.remove('hide');
  els.appPanel.classList.add('hide');
  els.userEmail.textContent = '—';
  resetConnectionUI();
}

function renderSignedIn() {
  els.authPanel.classList.add('hide');
  els.appPanel.classList.remove('hide');
  els.userEmail.textContent = session?.user?.email || '—';
}

function resetConnectionUI() {
  els.connectionSelect.replaceChildren(new Option('Bağlantı seç', ''));
  els.connectionMeta.textContent = 'Henüz bağlantı seçilmedi.';
  els.credentialState.textContent = 'Bağlantı seç';
  els.healthState.textContent = '—'; els.healthMeta.textContent = '—';
  els.confidenceState.textContent = '—'; els.coverageMeta.textContent = '—';
  els.grossSales.textContent = '—'; els.grossReturns.textContent = '—'; els.commissionCost.textContent = '—'; els.sellerRevenue.textContent = '—'; els.transactions.textContent = '—';
  renderEmptyTable(els.worstProducts, 7, 'Veri bekleniyor.');
  renderEmptyTable(els.historyBody, 5, 'Geçmiş bekleniyor.');
}

function renderEmptyTable(body, columns, text) {
  body.replaceChildren();
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = columns; td.className = 'empty'; td.textContent = text;
  tr.append(td); body.append(tr);
}

function selectedConnection() {
  return connections.find((item) => item.id === activeConnectionId) || null;
}

function renderConnections() {
  const current = activeConnectionId;
  els.connectionSelect.replaceChildren(new Option('Bağlantı seç', ''));
  for (const item of connections) {
    const label = `${item.display_name || 'Mağaza'} · ${String(item.marketplace || '').toLocaleUpperCase('tr-TR')}`;
    els.connectionSelect.add(new Option(label, item.id));
  }
  if (current && connections.some((x) => x.id === current)) els.connectionSelect.value = current;
  else els.connectionSelect.value = '';
  renderConnectionMeta();
}

function renderConnectionMeta() {
  const item = selectedConnection();
  if (!item) {
    els.connectionMeta.textContent = 'Henüz bağlantı seçilmedi.';
    return;
  }
  const last = item.last_sync_at ? new Date(item.last_sync_at).toLocaleString('tr-TR') : 'henüz yok';
  const provider = providerCatalog.find((entry) => entry.key === item.marketplace);
  const tierMap = { live: 'Canlı', beta: 'Beta', gated: 'Onay gerekli', import: 'Rapor bağlantısı' };
  els.connectionMeta.textContent = `${provider?.label || item.marketplace} · ${item.external_seller_id || 'Kod yok'} · ${tierMap[item.capability_tier] || item.status || '—'} · Son veri: ${last}`;
  window.KKSaleReady?.renderActiveProvider?.(item, provider);
}

async function loadConnections({ preserve = true } = {}) {
  const data = await functionRequest('marketplace-connections');
  connections = Array.isArray(data.connections) ? data.connections : [];
  providerCatalog = Array.isArray(data.providers) ? data.providers : providerCatalog;
  window.KKSaleReady?.renderProviders?.();
  const stored = preserve ? sessionStorage.getItem(ACTIVE_CONNECTION_KEY) : '';
  if (!activeConnectionId && stored && connections.some((x) => x.id === stored)) activeConnectionId = stored;
  if (!activeConnectionId && connections.length === 1) activeConnectionId = connections[0].id;
  if (activeConnectionId && !connections.some((x) => x.id === activeConnectionId)) activeConnectionId = '';
  if (activeConnectionId) sessionStorage.setItem(ACTIVE_CONNECTION_KEY, activeConnectionId);
  renderConnections();
  if (activeConnectionId) await refreshConnectionData();
  else resetDashboardOnly();
}

function resetDashboardOnly() {
  els.credentialState.textContent = activeConnectionId ? 'Kontrol ediliyor…' : 'Bağlantı seç';
  els.healthState.textContent = '—'; els.healthMeta.textContent = '—';
  els.confidenceState.textContent = '—'; els.coverageMeta.textContent = '—';
  els.grossSales.textContent = '—'; els.grossReturns.textContent = '—'; els.commissionCost.textContent = '—'; els.sellerRevenue.textContent = '—'; els.transactions.textContent = '—';
  renderEmptyTable(els.worstProducts, 7, 'Veri bekleniyor.');
  renderEmptyTable(els.historyBody, 5, 'Geçmiş bekleniyor.');
}

function formatMoney(value, currency = 'TRY') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n); }
  catch { return `${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency}`; }
}

function formatPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `%${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('tr-TR');
}

function addCells(row, values) {
  for (const value of values) {
    const td = document.createElement('td');
    td.textContent = value == null ? '—' : String(value);
    row.append(td);
  }
}

function renderDashboard(data) {
  const currency = data?.currency || 'TRY';
  const totals = data?.totals || {};
  els.grossSales.textContent = formatMoney(totals.grossSales, currency);
  els.grossReturns.textContent = formatMoney(totals.grossReturns, currency);
  els.commissionCost.textContent = formatMoney(totals.commissionCost, currency);
  els.sellerRevenue.textContent = formatMoney(totals.sellerRevenue, currency);
  els.transactions.textContent = Number.isFinite(Number(totals.transactions)) ? Number(totals.transactions).toLocaleString('tr-TR') : '—';

  const confidenceMap = {
    no_product_data: 'Ürün verisi yok', platform_only: 'Platform verisi', partial_cost_coverage: 'Kısmi maliyet', cost_enriched: 'Maliyetli veri'
  };
  els.confidenceState.textContent = confidenceMap[data?.dataConfidence] || data?.dataConfidence || '—';
  const coverage = Number(data?.costCoverage);
  els.coverageMeta.textContent = Number.isFinite(coverage) ? `Maliyet kapsaması: ${formatPercent(coverage * 100)}` : 'Maliyet kapsaması: —';

  const worst = Array.isArray(data?.products?.worst) ? data.products.worst : [];
  if (!worst.length) {
    renderEmptyTable(els.worstProducts, 7, 'Henüz ürün kâr verisi yok.');
    return;
  }
  els.worstProducts.replaceChildren();
  const statusMap = { loss: 'Zarar', risk: 'Riskli', healthy: 'Sağlıklı', unknown: 'Bilinmiyor' };
  const confidenceLabels = { cost_known: 'Maliyet biliniyor', estimated: 'Tahmini', platform_only: 'Platform-only' };
  for (const p of worst) {
    const tr = document.createElement('tr');
    addCells(tr, [
      p.name || p.sku || p.externalProductId || '—',
      Number(p.units || 0).toLocaleString('tr-TR'),
      formatMoney(p.sellerRevenue, currency),
      p.estimatedProfit == null ? '—' : formatMoney(p.estimatedProfit, currency),
      p.margin == null ? '—' : formatPercent(p.margin),
      confidenceLabels[p.confidence] || p.confidence || '—',
      statusMap[p.status] || p.status || '—'
    ]);
    els.worstProducts.append(tr);
  }
}

function renderHealth(data) {
  const labels = {
    healthy: 'Sağlıklı', ready_to_sync: 'Senkrona hazır', needs_setup: 'Kurulum gerekli', reauth_required: 'Yetki yenile', sync_error: 'Senkron hatası', stale: 'Veri eski'
  };
  const freshness = { fresh: 'taze', recent: 'yakın', stale: 'eski', never_synced: 'henüz senkron yok' };
  els.healthState.textContent = labels[data?.health] || data?.health || '—';
  const age = Number(data?.ageMinutes);
  const ageText = Number.isFinite(age) ? `${age.toLocaleString('tr-TR')} dk önce` : freshness[data?.freshness] || '—';
  els.healthMeta.textContent = `Son sync: ${data?.lastSyncAt ? formatDate(data.lastSyncAt) : 'yok'} · ${ageText}`;
}

function renderHistory(data) {
  const runs = Array.isArray(data?.runs) ? data.runs : [];
  if (!runs.length) {
    renderEmptyTable(els.historyBody, 5, 'Henüz senkron geçmişi yok.');
    return;
  }
  els.historyBody.replaceChildren();
  for (const run of runs) {
    const tr = document.createElement('tr');
    const imported = Number(run.importedTransactions ?? run.importedOrders ?? 0);
    addCells(tr, [formatDate(run.startedAt || run.createdAt), run.status || '—', Number.isFinite(imported) ? imported.toLocaleString('tr-TR') : '—', run.safeErrorCode || '—', formatDate(run.finishedAt)]);
    els.historyBody.append(tr);
  }
}

async function refreshConnectionData() {
  if (!activeConnectionId) return;
  resetDashboardOnly();
  const days = String(els.rangeDays.value || '30');
  const [credentialResult, summaryResult, healthResult, historyResult] = await Promise.allSettled([
    functionRequest('marketplace-credentials', { query: { connection_id: activeConnectionId } }),
    functionRequest('dashboard-summary', { query: { connection_id: activeConnectionId, days } }),
    functionRequest('connection-health', { query: { connection_id: activeConnectionId } }),
    functionRequest('sync-history', { query: { connection_id: activeConnectionId, limit: '10' } })
  ]);

  if (credentialResult.status === 'fulfilled') {
    const value = credentialResult.value;
    els.credentialState.textContent = value.configured ? 'Güvenli şekilde kayıtlı' : value.actionRequired ? 'Harici onay / rapor gerekiyor' : 'Henüz kaydedilmedi';
    window.KKSaleReady?.renderCredentialState?.(selectedConnection(), value);
  }
  else els.credentialState.textContent = `Kontrol edilemedi: ${humanError(credentialResult.reason)}`;

  if (summaryResult.status === 'fulfilled') renderDashboard(summaryResult.value);
  else {
    els.confidenceState.textContent = 'Veri alınamadı';
    els.coverageMeta.textContent = humanError(summaryResult.reason);
  }

  if (healthResult.status === 'fulfilled') renderHealth(healthResult.value);
  else {
    els.healthState.textContent = 'Kontrol edilemedi';
    els.healthMeta.textContent = humanError(healthResult.reason);
  }

  if (historyResult.status === 'fulfilled') renderHistory(historyResult.value);
  else renderEmptyTable(els.historyBody, 5, `Geçmiş alınamadı: ${humanError(historyResult.reason)}`);
}

els.authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = cleanText(els.authEmail.value, 254).toLowerCase();
  const password = String(els.authPassword.value || '');
  if (!validEmail(email) || password.length < 8 || password.length > 128) {
    setNotice(els.authMessage, 'Geçerli email ve en az 8 karakterli şifre gir.', 'bad');
    return;
  }
  setBusy(els.signInBtn, true, 'Giriş yapılıyor…');
  setNotice(els.authMessage);
  try {
    const data = await authRequest('/auth/v1/token?grant_type=password', { body: { email, password } });
    saveSession(data);
    els.authPassword.value = '';
    renderSignedIn();
    await loadConnections();
  } catch (error) {
    setNotice(els.authMessage, humanError(error), 'bad');
  } finally {
    setBusy(els.signInBtn, false);
  }
});

els.signUpBtn.addEventListener('click', async () => {
  const email = cleanText(els.authEmail.value, 254).toLowerCase();
  const password = String(els.authPassword.value || '');
  if (!validEmail(email) || password.length < 8 || password.length > 128) {
    setNotice(els.authMessage, 'Geçerli email ve en az 8 karakterli şifre gir.', 'bad');
    return;
  }
  setBusy(els.signUpBtn, true, 'Oluşturuluyor…');
  setNotice(els.authMessage);
  try {
    const data = await authRequest('/auth/v1/signup', { body: { email, password } });
    els.authPassword.value = '';
    if (data?.access_token && data?.refresh_token && data?.user) {
      saveSession(data);
      renderSignedIn();
      await loadConnections();
    } else {
      setNotice(els.authMessage, 'Hesap oluşturuldu. Email doğrulama mesajındaki bağlantıya tıkla, sonra giriş yap.', 'good');
    }
  } catch (error) {
    setNotice(els.authMessage, humanError(error), 'bad');
  } finally {
    setBusy(els.signUpBtn, false);
  }
});

els.signOutBtn.addEventListener('click', async () => {
  const token = session?.access_token;
  try {
    if (token) await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch { /* local sign-out still proceeds */ }
  clearSession();
  renderSignedOut();
});

els.createConnectionBtn.addEventListener('click', async () => {
  const marketplace = cleanText(els.marketplaceSelect?.value || 'trendyol', 20);
  const provider = providerCatalog.find((entry) => entry.key === marketplace);
  const displayName = cleanText(els.connectionName.value, 120);
  const sellerId = cleanText(els.sellerId.value, 120);
  if (!displayName || provider?.sellerIdRequired && !sellerId || marketplace === 'trendyol' && !/^\d{1,20}$/.test(sellerId)) {
    setNotice(els.connectionMessage, `${provider?.sellerIdLabel || 'Satıcı kodu'} ve mağaza adını kontrol et.`, 'bad');
    return;
  }
  setBusy(els.createConnectionBtn, true, 'Oluşturuluyor…');
  setNotice(els.connectionMessage);
  try {
    const data = await functionRequest('marketplace-connections', { method: 'POST', body: { marketplace, display_name: displayName, external_seller_id: sellerId || null } });
    activeConnectionId = data?.connection?.id || '';
    if (activeConnectionId) sessionStorage.setItem(ACTIVE_CONNECTION_KEY, activeConnectionId);
    els.connectionName.value = ''; els.sellerId.value = '';
    setNotice(els.connectionMessage, `${provider?.label || 'Kanal'} çalışma alanına eklendi.`, 'good');
    await loadConnections({ preserve: false });
  } catch (error) {
    setNotice(els.connectionMessage, humanError(error), 'bad');
  } finally {
    setBusy(els.createConnectionBtn, false);
  }
});

els.connectionSelect.addEventListener('change', async () => {
  activeConnectionId = els.connectionSelect.value || '';
  if (activeConnectionId) sessionStorage.setItem(ACTIVE_CONNECTION_KEY, activeConnectionId);
  else sessionStorage.removeItem(ACTIVE_CONNECTION_KEY);
  renderConnectionMeta();
  if (activeConnectionId) await refreshConnectionData();
  else resetDashboardOnly();
});

els.saveCredentialsBtn.addEventListener('click', async () => {
  if (!activeConnectionId) { setNotice(els.credentialMessage, 'Önce bağlantı seç.', 'bad'); return; }
  const connection = selectedConnection();
  const provider = providerCatalog.find((entry) => entry.key === connection?.marketplace);
  const fields = Array.isArray(provider?.credentialFields) ? provider.credentialFields : [];
  if (!fields.length) { setNotice(els.credentialMessage, provider?.note || 'Bu kanal farklı bir yetkilendirme akışı kullanıyor.', 'bad'); return; }
  const apiKey = cleanText(els.apiKey.value, 220);
  const apiSecret = cleanText(els.apiSecret.value, 320);
  if (apiKey.length < 6 || apiSecret.length < 6) { setNotice(els.credentialMessage, 'API Key ve API Secret alanlarını doldur.', 'bad'); return; }
  setBusy(els.saveCredentialsBtn, true, 'Kaydediliyor…');
  setNotice(els.credentialMessage);
  try {
    await functionRequest('marketplace-credentials', { method: 'POST', body: { connection_id: activeConnectionId, credentials: { [fields[0].key]: apiKey, [fields[1].key]: apiSecret } } });
    els.apiKey.value = ''; els.apiSecret.value = '';
    setNotice(els.credentialMessage, `${provider?.label || 'Kanal'} bilgileri Vault’a güvenli şekilde kaydedildi. İlk veri alışında erişim ayrıca doğrulanır.`, 'good');
    await loadConnections();
  } catch (error) {
    setNotice(els.credentialMessage, humanError(error), 'bad');
  } finally {
    setBusy(els.saveCredentialsBtn, false);
  }
});

els.oauthConnectBtn?.addEventListener('click', async () => {
  if (!activeConnectionId) { setNotice(els.credentialMessage, 'Önce Amazon bağlantısını çalışma alanına ekleyip seç.', 'bad'); return; }
  const connection = selectedConnection();
  if (connection?.marketplace !== 'amazon') { setNotice(els.credentialMessage, 'Bu düğme yalnızca Amazon bağlantısı için kullanılır.', 'bad'); return; }
  setBusy(els.oauthConnectBtn, true, 'Amazon açılıyor…');
  setNotice(els.credentialMessage, 'Tek kullanımlık güvenli bağlantı hazırlanıyor…');
  try {
    const data = await functionRequest('amazon-auth-start', { method: 'POST', body: { connection_id: activeConnectionId } });
    const target = new URL(String(data.authorizationUrl || ''));
    if (target.protocol !== 'https:' || target.hostname !== 'sellercentral.amazon.com.tr' || target.pathname !== '/apps/authorize/consent') throw new Error('AMAZON_AUTH_START_FAILED');
    location.assign(target.toString());
  } catch (error) {
    setNotice(els.credentialMessage, humanError(error), 'bad');
    setBusy(els.oauthConnectBtn, false);
  }
});

els.syncBtn.addEventListener('click', async () => {
  if (!activeConnectionId) { setNotice(els.syncMessage, 'Önce bağlantı seç.', 'bad'); return; }
  const connection = selectedConnection();
  if (!['trendyol', 'hepsiburada', 'n11', 'amazon'].includes(connection?.marketplace)) {
    document.getElementById('credentials')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setNotice(els.syncMessage, `${providerCatalog.find((entry) => entry.key === connection?.marketplace)?.label || 'Bu kanal'} için standart raporu yükle; API erişimi hazır olduğunda aynı mağazada kesintisiz devam eder.`, 'good');
    return;
  }
  const days = Number(els.rangeDays.value);
  setBusy(els.syncBtn, true, 'Senkronlanıyor…');
  const providerName = connection.marketplace === 'hepsiburada' ? 'Hepsiburada' : connection.marketplace === 'n11' ? 'n11' : connection.marketplace === 'amazon' ? 'Amazon' : 'Trendyol';
  const syncFunction = connection.marketplace === 'hepsiburada' ? 'hepsiburada-sync' : connection.marketplace === 'n11' ? 'n11-sync' : connection.marketplace === 'amazon' ? 'amazon-sync' : 'trendyol-sync';
  setNotice(els.syncMessage, `${providerName} finans verileri güvenli şekilde alınıyor…`);
  try {
    const data = await functionRequest(syncFunction, { method: 'POST', body: { connection_id: activeConnectionId, days } });
    setNotice(els.syncMessage, `Senkron tamamlandı: ${Number(data.importedTransactions || 0).toLocaleString('tr-TR')} işlem, ${Number(data.dailyRows || 0).toLocaleString('tr-TR')} günlük kayıt.`, 'good');
    await loadConnections();
  } catch (error) {
    setNotice(els.syncMessage, humanError(error), 'bad');
    await refreshConnectionData().catch(() => {});
  } finally {
    setBusy(els.syncBtn, false);
  }
});

els.saveCostBtn.addEventListener('click', async () => {
  if (!activeConnectionId) { setNotice(els.costMessage, 'Önce bağlantı seç.', 'bad'); return; }
  const productId = cleanText(els.costProductId.value, 180);
  const amount = Number(String(els.costAmount.value).replace(',', '.'));
  const vat = Number(String(els.costVat.value).replace(',', '.'));
  if (!productId || !Number.isFinite(amount) || amount < 0 || amount > 100000000 || !Number.isFinite(vat) || vat < 0 || vat > 100) {
    setNotice(els.costMessage, 'Ürün ID, geçerli maliyet ve 0–100 arası KDV gir.', 'bad');
    return;
  }
  setBusy(els.saveCostBtn, true, 'Kaydediliyor…');
  setNotice(els.costMessage);
  try {
    await functionRequest('product-costs', { method: 'POST', body: { connection_id: activeConnectionId, external_product_id: productId, cost_amount: amount, purchase_vat_rate: vat } });
    els.costProductId.value = ''; els.costAmount.value = '';
    setNotice(els.costMessage, 'Maliyet sürümü kaydedildi.', 'good');
    await refreshConnectionData();
  } catch (error) {
    setNotice(els.costMessage, humanError(error), 'bad');
  } finally {
    setBusy(els.saveCostBtn, false);
  }
});

els.rangeDays.addEventListener('change', () => { if (activeConnectionId) refreshConnectionData().catch(() => {}); });
els.refreshAllBtn.addEventListener('click', async () => {
  setBusy(els.refreshAllBtn, true, 'Yenileniyor…');
  try { await loadConnections(); }
  catch (error) { setNotice(els.syncMessage, humanError(error), 'bad'); }
  finally { setBusy(els.refreshAllBtn, false); }
});

async function completeAmazonLoginHandoff(params) {
  const amazonCallbackUri = params.get('amazon_callback_uri');
  const amazonState = params.get('amazon_state');
  const sellerId = params.get('selling_partner_id');
  if (!amazonCallbackUri && !amazonState && !sellerId) return false;
  const amazonConnections = connections.filter((item) => item.marketplace === 'amazon');
  let connection = selectedConnection();
  if (connection?.marketplace !== 'amazon' && amazonConnections.length === 1) {
    connection = amazonConnections[0]; activeConnectionId = connection.id; sessionStorage.setItem(ACTIVE_CONNECTION_KEY, connection.id);
  }
  try {
    if (!connection || connection.marketplace !== 'amazon' || !amazonCallbackUri || !amazonState || !sellerId) throw new Error('AMAZON_LOGIN_REQUEST_INVALID');
    const data = await functionRequest('amazon-auth-login', { method: 'POST', body: { connection_id: connection.id, amazon_callback_uri: amazonCallbackUri, amazon_state: amazonState, selling_partner_id: sellerId, version: params.get('version') || '' } });
    const target = new URL(String(data.continuationUrl || ''));
    const allowedHosts = new Set(['sellercentral.amazon.com.tr', 'sellercentral.amazon.com', 'amazon.com']);
    if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname) || !target.pathname.startsWith('/apps/authorize/confirm/')) throw new Error('AMAZON_LOGIN_HANDOFF_FAILED');
    history.replaceState(null, '', `${location.pathname}${location.hash}`);
    location.assign(target.toString());
    return true;
  } catch (error) {
    for (const key of ['amazon_callback_uri', 'amazon_state', 'selling_partner_id', 'version']) params.delete(key);
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    setNotice(els.credentialMessage, humanError(error), 'bad');
    document.getElementById('credentials')?.scrollIntoView({ block: 'start' });
    return false;
  }
}

(async function boot() {
  session = parseStoredSession();
  if (!session) { renderSignedOut(); return; }
  renderSignedIn();
  try {
    await ensureAccessToken();
    await loadConnections();
    const callbackParams = new URLSearchParams(location.search);
    if (await completeAmazonLoginHandoff(callbackParams)) return;
    const amazonResult = callbackParams.get('amazon');
    if (amazonResult === 'connected') {
      setNotice(els.credentialMessage, 'Amazon mağazası güvenli şekilde bağlandı. Finans verilerini artık eşitleyebilirsin.', 'good');
      document.getElementById('credentials')?.scrollIntoView({ block: 'start' });
    } else if (amazonResult === 'error') {
      setNotice(els.credentialMessage, humanError(new Error(callbackParams.get('code') || 'AMAZON_OAUTH_EXCHANGE_FAILED')), 'bad');
      document.getElementById('credentials')?.scrollIntoView({ block: 'start' });
    }
    if (amazonResult) {
      callbackParams.delete('amazon'); callbackParams.delete('code');
      const query = callbackParams.toString();
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    }
  } catch (error) {
    clearSession();
    renderSignedOut();
    setNotice(els.authMessage, `Oturum yeniden açılmalı: ${humanError(error)}`, 'bad');
  }
})();
