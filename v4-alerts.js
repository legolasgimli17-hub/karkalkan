'use strict';

/* Financial truth + rule-based alerts. Loaded after v4-enhance.js. */
const alertUi = {
  panel: null,
  list: null,
  critical: null,
  warning: null,
  info: null,
  stoppage: null,
  cargo: null,
  cargoCoverage: null,
  knownCash: null
};

function alertMoney(value, currency = 'TRY') {
  return Number.isFinite(Number(value)) ? formatMoney(Number(value), currency) : '—';
}

function alertPercent(value) {
  return Number.isFinite(Number(value)) ? formatPercent(Number(value)) : '—';
}

function alertCreate() {
  const anchor = document.getElementById('financeTruthPanel') || document.querySelector('#dashboard .dashboard-split');
  if (!anchor || document.getElementById('ruleAlertPanel')) return;

  const panel = document.createElement('section');
  panel.id = 'ruleAlertPanel';
  panel.className = 'panel alert-panel top-gap';

  const head = document.createElement('div');
  head.className = 'panel-title-row';
  const copy = document.createElement('div');
  const eyebrow = document.createElement('p');
  const title = document.createElement('h3');
  const note = document.createElement('span');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'KURAL TABANLI UYARILAR';
  title.textContent = 'Finansal durum ve risk uyarıları';
  note.className = 'muted';
  note.textContent = 'Uyarılar açık eşiklerle çalışır; yapay zekâ tahmini değildir.';
  copy.append(eyebrow, title);
  head.append(copy, note);

  const truth = document.createElement('div');
  truth.className = 'alert-truth-grid';
  for (const [label, id, help] of [
    ['E-ticaret stopajı', 'alertStoppage', 'Ödeme sırasında kesilen stopaj tutarı'],
    ['Kargo faturası', 'alertCargo', 'Trendyol kargo fatura kalemleri toplamı'],
    ['Kargo dağıtım kapsamı', 'alertCargoCoverage', 'Siparişten ürüne eşleştirilebilen kargo bölümü'],
    ['Bilinen kesintilerden sonra kalan', 'alertKnownCash', 'Resmî net kâr değildir; bilinen kesintiler sonrası görünüm']
  ]) {
    const card = document.createElement('div');
    card.className = 'alert-truth-card';
    const span = document.createElement('span');
    const strong = document.createElement('strong');
    const small = document.createElement('small');
    span.textContent = label;
    strong.id = id;
    strong.textContent = '—';
    small.textContent = help;
    card.append(span, strong, small);
    truth.append(card);
  }

  const summary = document.createElement('div');
  summary.className = 'alert-summary';
  for (const [label, id, cls] of [
    ['Kritik', 'alertCritical', 'critical'],
    ['Uyarı', 'alertWarning', 'warning'],
    ['Bilgi', 'alertInfo', 'info']
  ]) {
    const chip = document.createElement('div');
    chip.className = `alert-count ${cls}`;
    const strong = document.createElement('strong');
    const span = document.createElement('span');
    strong.id = id;
    strong.textContent = '0';
    span.textContent = label;
    chip.append(strong, span);
    summary.append(chip);
  }

  const list = document.createElement('div');
  list.id = 'alertList';
  list.className = 'alert-list';
  const empty = document.createElement('p');
  empty.className = 'muted';
  empty.textContent = 'Uyarı verisi bekleniyor.';
  list.append(empty);

  panel.append(head, truth, summary, list);
  anchor.after(panel);
  Object.assign(alertUi, {
    panel,
    list,
    critical: document.getElementById('alertCritical'),
    warning: document.getElementById('alertWarning'),
    info: document.getElementById('alertInfo'),
    stoppage: document.getElementById('alertStoppage'),
    cargo: document.getElementById('alertCargo'),
    cargoCoverage: document.getElementById('alertCargoCoverage'),
    knownCash: document.getElementById('alertKnownCash')
  });
}

function alertReset() {
  for (const element of [alertUi.stoppage, alertUi.cargo, alertUi.cargoCoverage, alertUi.knownCash]) {
    if (element) element.textContent = '—';
  }
  for (const element of [alertUi.critical, alertUi.warning, alertUi.info]) {
    if (element) element.textContent = '0';
  }
  if (alertUi.list) {
    alertUi.list.replaceChildren();
    const paragraph = document.createElement('p');
    paragraph.className = 'muted';
    paragraph.textContent = 'Uyarı verisi bekleniyor.';
    alertUi.list.append(paragraph);
  }
}

function alertRender(data) {
  const financial = data?.financialTruth || {};
  const counts = data?.counts || {};
  const currency = 'TRY';

  if (alertUi.stoppage) alertUi.stoppage.textContent = alertMoney(financial.stoppageNet, currency);
  if (alertUi.cargo) alertUi.cargo.textContent = alertMoney(financial.cargoCost, currency);
  if (alertUi.cargoCoverage) alertUi.cargoCoverage.textContent = alertPercent(financial.cargoAllocationCoverage);
  if (alertUi.knownCash) alertUi.knownCash.textContent = alertMoney(financial.knownCashAfterFeesAndStoppage, currency);
  if (alertUi.critical) alertUi.critical.textContent = Number(counts.critical || 0).toLocaleString('tr-TR');
  if (alertUi.warning) alertUi.warning.textContent = Number(counts.warning || 0).toLocaleString('tr-TR');
  if (alertUi.info) alertUi.info.textContent = Number(counts.info || 0).toLocaleString('tr-TR');
  if (!alertUi.list) return;

  alertUi.list.replaceChildren();
  const rows = Array.isArray(data?.alerts) ? data.alerts : [];
  if (!rows.length) {
    const paragraph = document.createElement('p');
    paragraph.className = 'alert-empty';
    paragraph.textContent = 'Seçili dönemde kural tabanlı risk uyarısı oluşmadı.';
    alertUi.list.append(paragraph);
    return;
  }

  for (const alert of rows) {
    const row = document.createElement('article');
    row.className = `alert-row ${['critical', 'warning', 'info'].includes(alert.severity) ? alert.severity : 'info'}`;
    const badge = document.createElement('span');
    badge.className = 'alert-badge';
    badge.textContent = alert.severity === 'critical' ? 'Kritik' : alert.severity === 'warning' ? 'Uyarı' : 'Bilgi';
    const body = document.createElement('div');
    const strong = document.createElement('strong');
    const small = document.createElement('small');
    strong.textContent = String(alert.label || alert.externalProductId || 'Mağaza');
    small.textContent = String(alert.message || 'Risk sinyali');
    body.append(strong, small);
    row.append(badge, body);
    alertUi.list.append(row);
  }
}

async function loadRuleAlerts() {
  if (!activeConnectionId) {
    alertReset();
    return;
  }
  try {
    const days = Number(els?.rangeDays?.value || 30);
    const data = await functionRequest('risk-alerts', { query: { connection_id: activeConnectionId, days } });
    alertRender(data);
  } catch (error) {
    if (alertUi.list) {
      alertUi.list.replaceChildren();
      const paragraph = document.createElement('p');
      paragraph.className = 'alert-empty bad';
      paragraph.textContent = `Uyarı verisi alınamadı: ${humanError(error)}`;
      alertUi.list.append(paragraph);
    }
  }
}

/*
 * Trendyol sometimes changes human-readable settlement descriptions. The sync
 * worker records rows it could not classify. Never let that audit signal stay
 * hidden: a non-zero count is surfaced immediately after a successful sync.
 */
const alertCoreFunctionRequest = functionRequest;
functionRequest = async function alertAwareFunctionRequest(name, options = {}) {
  const data = await alertCoreFunctionRequest(name, options);
  const method = String(options?.method || 'GET').toUpperCase();
  if (name === 'trendyol-sync' && method === 'POST') {
    const unclassified = Number(data?.unclassifiedAdjustmentRows || 0);
    if (unclassified > 0) {
      setTimeout(() => {
        setNotice(
          els.syncMessage,
          `Senkron tamamlandı; ${unclassified.toLocaleString('tr-TR')} finans hareketi mevcut kurallarla sınıflandırılamadı. Bu hareketler senkron geçmişinde kayıtlıdır ve finans özeti kontrol edilmelidir.`
        );
      }, 0);
    }
  }
  return data;
};

alertCreate();
const alertCoreRefresh = refreshConnectionData;
refreshConnectionData = async function refreshWithAlerts() {
  await alertCoreRefresh();
  await loadRuleAlerts();
};
const alertCoreReset = resetDashboardOnly;
resetDashboardOnly = function resetWithAlerts() {
  alertCoreReset();
  alertReset();
};
if (typeof activeConnectionId === 'string' && activeConnectionId) loadRuleAlerts().catch(() => {});

/* vNext is layered after the stable authenticated core so it can be removed or upgraded independently. */
(function loadKarkalkanVNext(){
  if(!document.querySelector('link[data-karkalkan-vnext]')){
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='/vnext.css';link.dataset.karkalkanVnext='1';document.head.append(link);
  }
  if(!document.querySelector('script[data-karkalkan-vnext]')){
    const script=document.createElement('script');
    script.src='/vnext.js';script.dataset.karkalkanVnext='1';document.body.append(script);
  }
})();
