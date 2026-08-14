'use strict';

/* Progressive v4 enhancements. Keeps the authenticated core in v4.js small and stable. */
const v4x = {
  coveredProfit: document.getElementById('coveredProfit'),
  coveredMargin: document.getElementById('coveredMargin'),
  profitScopeMeta: document.getElementById('profitScopeMeta'),
  costCoverageValue: document.getElementById('costCoverageValue'),
  costCoverageCount: document.getElementById('costCoverageCount'),
  costCoverageProgress: document.getElementById('costCoverageProgress'),
  salesCoverageMeta: document.getElementById('salesCoverageMeta'),
  returnRateMeta: document.getElementById('returnRateMeta'),
  commissionRateMeta: document.getElementById('commissionRateMeta'),
  needsCostBody: document.getElementById('needsCostBody'),
  advancedWorstProducts: document.getElementById('advancedWorstProducts'),
  costLedgerBody: document.getElementById('costLedgerBody'),
  jumpToMissingCostsBtn: document.getElementById('jumpToMissingCostsBtn'),
  trendChart: null,
  trendEmpty: null,
  bulkCostFile: null,
  bulkCostPreview: null,
  bulkCostMessage: null,
  bulkCostImportBtn: null,
  bulkCostTemplateBtn: null
};

let parsedBulkCosts = [];
const BULK_MAX_ROWS = 500;
const BULK_MAX_BYTES = 1024 * 1024;

function xEmpty(body, columns, message) {
  if (!body) return;
  body.replaceChildren();
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = columns;
  cell.className = 'empty';
  cell.textContent = message;
  row.append(cell);
  body.append(row);
}

function xButton(label, className = 'btn ghost compact-btn') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function xProductLabel(product) {
  return String(product?.name || product?.sku || product?.barcode || product?.externalProductId || '—');
}

function xIstanbulDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function xSetBulkNotice(message = '', kind = '') {
  if (!v4x.bulkCostMessage) return;
  v4x.bulkCostMessage.textContent = message;
  v4x.bulkCostMessage.classList.remove('good', 'bad');
  if (kind) v4x.bulkCostMessage.classList.add(kind);
}

function xCreateUi() {
  const dashboardSplit = document.querySelector('#dashboard .dashboard-split');
  if (dashboardSplit && !document.getElementById('trendPanel')) {
    const panel = document.createElement('section');
    panel.id = 'trendPanel';
    panel.className = 'panel trend-panel top-gap';

    const head = document.createElement('div');
    head.className = 'trend-head';
    const copy = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'TREND MONITOR';
    const title = document.createElement('h3');
    title.textContent = 'Günlük finansal hareket';
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = 'Brüt satış, satıcı geliri ve iade eğilimini seçili dönemde karşılaştır.';
    copy.append(eyebrow, title, desc);

    const legend = document.createElement('div');
    legend.className = 'trend-legend';
    for (const [label, cls] of [['Brüt satış', 'sales'], ['Satıcı geliri', 'revenue'], ['İade', 'returns']]) {
      const item = document.createElement('span');
      const dot = document.createElement('i');
      dot.className = cls;
      item.append(dot, document.createTextNode(label));
      legend.append(item);
    }
    head.append(copy, legend);

    const chartWrap = document.createElement('div');
    chartWrap.className = 'trend-chart-wrap';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'trendChart';
    svg.setAttribute('viewBox', '0 0 1000 280');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Günlük finansal hareket grafiği');
    svg.setAttribute('preserveAspectRatio', 'none');
    const empty = document.createElement('p');
    empty.id = 'trendEmpty';
    empty.className = 'trend-empty';
    empty.textContent = 'Grafik için senkronlanmış veri bekleniyor.';
    chartWrap.append(svg, empty);
    panel.append(head, chartWrap);
    dashboardSplit.before(panel);
    v4x.trendChart = svg;
    v4x.trendEmpty = empty;
  } else {
    v4x.trendChart = document.getElementById('trendChart');
    v4x.trendEmpty = document.getElementById('trendEmpty');
  }

  const costsSection = document.getElementById('costs');
  const ledger = costsSection?.querySelector('.data-panel');
  if (costsSection && ledger && !document.getElementById('bulkCostPanel')) {
    const panel = document.createElement('div');
    panel.id = 'bulkCostPanel';
    panel.className = 'panel bulk-cost-panel top-gap';

    const head = document.createElement('div');
    head.className = 'bulk-cost-head';
    const copy = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'BULK COST IMPORT';
    const title = document.createElement('h3');
    title.textContent = 'CSV ile toplu maliyet yükle';
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = `Tek seferde en fazla ${BULK_MAX_ROWS} ürün maliyeti. Dosya önce tarayıcıda doğrulanır.`;
    copy.append(eyebrow, title, desc);
    const template = xButton('CSV şablonunu indir');
    template.id = 'bulkCostTemplateBtn';
    head.append(copy, template);

    const controls = document.createElement('div');
    controls.className = 'bulk-cost-controls';
    const fileWrap = document.createElement('label');
    fileWrap.className = 'bulk-file-label';
    fileWrap.setAttribute('for', 'bulkCostFile');
    const labelTop = document.createElement('strong');
    labelTop.textContent = 'CSV dosyası seç';
    const labelSub = document.createElement('span');
    labelSub.textContent = 'Barkod/ürün ID · maliyet · alış KDV · geçerlilik tarihi';
    fileWrap.append(labelTop, labelSub);
    const file = document.createElement('input');
    file.id = 'bulkCostFile';
    file.type = 'file';
    file.accept = '.csv,text/csv';
    const importBtn = xButton('Doğrula ve içe aktar', 'btn primary');
    importBtn.id = 'bulkCostImportBtn';
    importBtn.disabled = true;
    controls.append(fileWrap, file, importBtn);

    const preview = document.createElement('div');
    preview.id = 'bulkCostPreview';
    preview.className = 'bulk-preview muted';
    preview.textContent = 'Henüz dosya seçilmedi.';
    const notice = document.createElement('div');
    notice.id = 'bulkCostMessage';
    notice.className = 'notice';
    notice.setAttribute('role', 'status');

    panel.append(head, controls, preview, notice);
    ledger.before(panel);
    v4x.bulkCostFile = file;
    v4x.bulkCostPreview = preview;
    v4x.bulkCostMessage = notice;
    v4x.bulkCostImportBtn = importBtn;
    v4x.bulkCostTemplateBtn = template;
  } else {
    v4x.bulkCostFile = document.getElementById('bulkCostFile');
    v4x.bulkCostPreview = document.getElementById('bulkCostPreview');
    v4x.bulkCostMessage = document.getElementById('bulkCostMessage');
    v4x.bulkCostImportBtn = document.getElementById('bulkCostImportBtn');
    v4x.bulkCostTemplateBtn = document.getElementById('bulkCostTemplateBtn');
  }
}

function xReset() {
  if (v4x.coveredProfit) v4x.coveredProfit.textContent = '—';
  if (v4x.coveredMargin) v4x.coveredMargin.textContent = '—';
  if (v4x.profitScopeMeta) v4x.profitScopeMeta.textContent = 'Kapsam bekleniyor.';
  if (v4x.costCoverageValue) v4x.costCoverageValue.textContent = '—';
  if (v4x.costCoverageCount) v4x.costCoverageCount.textContent = '—';
  if (v4x.costCoverageProgress) v4x.costCoverageProgress.value = 0;
  if (v4x.salesCoverageMeta) v4x.salesCoverageMeta.textContent = 'Satış hacmi kapsaması —';
  if (v4x.returnRateMeta) v4x.returnRateMeta.textContent = 'İade oranı —';
  if (v4x.commissionRateMeta) v4x.commissionRateMeta.textContent = 'Komisyon oranı —';
  xEmpty(v4x.needsCostBody, 5, 'Veri bekleniyor.');
  xEmpty(v4x.advancedWorstProducts, 6, 'Veri bekleniyor.');
  xEmpty(v4x.costLedgerBody, 5, 'Maliyet kayıtları bekleniyor.');
  xRenderTrend([], 'TRY');
}

function xRenderNeedsCost(products, currency) {
  const rows = Array.isArray(products) ? products : [];
  if (!rows.length) {
    xEmpty(v4x.needsCostBody, 5, 'Eksik maliyet görünmüyor.');
    return;
  }
  v4x.needsCostBody.replaceChildren();
  for (const product of rows) {
    const tr = document.createElement('tr');
    const values = [
      xProductLabel(product),
      Number(product.units || 0).toLocaleString('tr-TR'),
      formatMoney(product.grossSales, currency),
      formatMoney(product.sellerRevenue, currency)
    ];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    const action = document.createElement('td');
    const button = xButton('Maliyet gir');
    button.dataset.costProduct = String(product.externalProductId || product.barcode || '');
    button.setAttribute('aria-label', `${xProductLabel(product)} için maliyet gir`);
    action.append(button);
    tr.append(action);
    v4x.needsCostBody.append(tr);
  }
}

function xRenderRisk(products, currency) {
  const rows = Array.isArray(products) ? products : [];
  if (!rows.length) {
    xEmpty(v4x.advancedWorstProducts, 6, 'Kâr hesabı için maliyet verisi bekleniyor.');
    return;
  }
  const statusMap = { loss: 'Zarar', risk: 'Riskli', healthy: 'Sağlıklı', unknown: 'Bilinmiyor' };
  v4x.advancedWorstProducts.replaceChildren();
  for (const product of rows) {
    const tr = document.createElement('tr');
    const values = [
      xProductLabel(product),
      Number(product.units || 0).toLocaleString('tr-TR'),
      formatMoney(product.sellerRevenue, currency),
      product.estimatedProfit == null ? '—' : formatMoney(product.estimatedProfit, currency),
      product.margin == null ? '—' : formatPercent(product.margin)
    ];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    const statusCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `status-pill ${['loss','risk','healthy'].includes(product.status) ? product.status : ''}`.trim();
    badge.textContent = statusMap[product.status] || product.status || '—';
    statusCell.append(badge);
    tr.append(statusCell);
    v4x.advancedWorstProducts.append(tr);
  }
}

function xSvg(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function xRenderTrend(daily, currency) {
  if (!v4x.trendChart) return;
  const rows = Array.isArray(daily) ? daily.filter((r) => r?.day) : [];
  v4x.trendChart.replaceChildren();
  if (!rows.length) {
    if (v4x.trendEmpty) v4x.trendEmpty.hidden = false;
    return;
  }
  if (v4x.trendEmpty) v4x.trendEmpty.hidden = true;

  const width = 1000, height = 280, padL = 58, padR = 22, padT = 18, padB = 42;
  const usableW = width - padL - padR, usableH = height - padT - padB;
  const values = rows.flatMap((r) => [Number(r.grossSales)||0, Number(r.sellerRevenue)||0, Number(r.grossReturns)||0]);
  const max = Math.max(1, ...values);
  const x = (i) => padL + (rows.length === 1 ? usableW / 2 : i * usableW / (rows.length - 1));
  const y = (v) => padT + usableH - (Math.max(0, Number(v)||0) / max) * usableH;

  for (let i = 0; i <= 4; i++) {
    const gy = padT + i * usableH / 4;
    const line = xSvg('line', { x1: padL, x2: width-padR, y1: gy, y2: gy, class: 'chart-grid' });
    v4x.trendChart.append(line);
    const label = xSvg('text', { x: padL-9, y: gy+4, 'text-anchor': 'end', class: 'chart-axis-label' });
    label.textContent = formatMoney(max * (4-i) / 4, currency).replace(/\s?₺/g, '');
    v4x.trendChart.append(label);
  }

  const series = [
    { key: 'grossSales', cls: 'chart-sales' },
    { key: 'sellerRevenue', cls: 'chart-revenue' },
    { key: 'grossReturns', cls: 'chart-returns' }
  ];
  for (const s of series) {
    const points = rows.map((r, i) => `${x(i)},${y(r[s.key])}`).join(' ');
    v4x.trendChart.append(xSvg('polyline', { points, class: `chart-line ${s.cls}`, fill: 'none' }));
  }

  const labelIndexes = rows.length <= 7 ? rows.map((_, i) => i) : [0, Math.floor((rows.length-1)/2), rows.length-1];
  for (const i of [...new Set(labelIndexes)]) {
    const text = xSvg('text', { x: x(i), y: height-14, 'text-anchor': i===0?'start':i===rows.length-1?'end':'middle', class: 'chart-axis-label' });
    const date = new Date(`${rows[i].day}T12:00:00+03:00`);
    text.textContent = Number.isNaN(date.getTime()) ? String(rows[i].day) : date.toLocaleDateString('tr-TR', { day:'2-digit', month:'short' });
    v4x.trendChart.append(text);
  }
}

function xRenderProfit(data) {
  const currency = data?.currency || 'TRY';
  const totals = data?.totals || {};
  const snapshot = data?.profitSnapshot || {};
  const coverage = Number(data?.costCoverage);
  const salesCoverage = Number(data?.salesCostCoverage);
  const covered = Number(snapshot.coveredProducts || 0);
  const total = Number(snapshot.totalProducts || 0);

  v4x.returnRateMeta.textContent = `İade oranı ${formatPercent(totals.returnRate)}`;
  v4x.commissionRateMeta.textContent = `Komisyon oranı ${formatPercent(totals.commissionRate)}`;
  v4x.coveredProfit.textContent = Number.isFinite(Number(snapshot.coveredProfit)) ? formatMoney(snapshot.coveredProfit, currency) : '—';
  v4x.coveredMargin.textContent = snapshot.coveredMargin == null ? '—' : formatPercent(snapshot.coveredMargin);
  v4x.profitScopeMeta.textContent = total ? `${covered}/${total} ürün maliyet kapsamına dahil.` : 'Henüz ürün verisi yok.';
  v4x.costCoverageValue.textContent = Number.isFinite(coverage) ? formatPercent(coverage * 100) : '—';
  v4x.costCoverageCount.textContent = total ? `${covered} / ${total} ürün` : 'Ürün yok';
  v4x.costCoverageProgress.value = Number.isFinite(coverage) ? Math.max(0, Math.min(100, coverage * 100)) : 0;
  v4x.salesCoverageMeta.textContent = Number.isFinite(salesCoverage) ? `Satış hacminin ${formatPercent(salesCoverage * 100)} bölümü maliyetli` : 'Satış hacmi kapsaması —';
  xRenderNeedsCost(data?.products?.needsCost, currency);
  xRenderRisk(data?.products?.worst, currency);
  xRenderTrend(data?.daily, currency);
}

async function xLoadCostLedger() {
  if (!activeConnectionId) {
    xEmpty(v4x.costLedgerBody, 5, 'Önce mağaza seç.');
    return;
  }
  try {
    const data = await functionRequest('product-costs', { query: { connection_id: activeConnectionId } });
    const rows = Array.isArray(data?.costs) ? data.costs : [];
    if (!rows.length) {
      xEmpty(v4x.costLedgerBody, 5, 'Henüz kayıtlı ürün maliyeti yok.');
      return;
    }
    v4x.costLedgerBody.replaceChildren();
    for (const cost of rows) {
      const tr = document.createElement('tr');
      const validText = cost.valid_to ? `${cost.valid_from} → ${cost.valid_to}` : `${cost.valid_from} → güncel`;
      const values = [String(cost.external_product_id || '—'), formatMoney(cost.cost_amount, 'TRY'), formatPercent(cost.purchase_vat_rate), validText];
      for (const value of values) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      const action = document.createElement('td');
      const button = xButton('Sil');
      button.dataset.deleteCost = String(cost.id || '');
      button.classList.add('danger-lite');
      action.append(button);
      tr.append(action);
      v4x.costLedgerBody.append(tr);
    }
  } catch (error) {
    xEmpty(v4x.costLedgerBody, 5, `Maliyetler alınamadı: ${humanError(error)}`);
  }
}

function xDetectDelimiter(text) {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim()) || '';
  const semicolons = (first.match(/;/g) || []).length;
  const commas = (first.match(/,/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

function xParseCsvLine(line, delimiter) {
  const out = [];
  let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i+1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(value.trim()); value = '';
    } else value += ch;
  }
  if (quoted) throw new Error('Kapanmamış tırnak bulundu.');
  out.push(value.trim());
  return out;
}

function xNormalizeHeader(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim().toLocaleLowerCase('tr-TR').replace(/[ıİ]/g, 'i').replace(/[ğĞ]/g, 'g').replace(/[üÜ]/g, 'u').replace(/[şŞ]/g, 's').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c').replace(/[\s-]+/g, '_');
}

function xHeaderIndex(headers, aliases) {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

function xParseLocalizedNumber(raw, delimiter) {
  let value = String(raw || '').trim().replace(/\s/g, '');
  if (!value) return NaN;
  if (delimiter === ';') value = value.replace(/\./g, '').replace(',', '.');
  else if (value.includes(',') && !value.includes('.')) value = value.replace(',', '.');
  else value = value.replace(/,/g, '');
  return Number(value);
}

function xParseBulkCsv(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('CSV dosyası boş.');
  const delimiter = xDetectDelimiter(text);
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('Başlık satırı ve en az bir veri satırı gerekli.');
  if (lines.length - 1 > BULK_MAX_ROWS) throw new Error(`En fazla ${BULK_MAX_ROWS} veri satırı yüklenebilir.`);
  const headers = xParseCsvLine(lines[0], delimiter).map(xNormalizeHeader);
  const productIdx = xHeaderIndex(headers, ['external_product_id','product_id','urun_id','urunid','barcode','barkod']);
  const costIdx = xHeaderIndex(headers, ['cost_amount','cost','maliyet','urun_maliyeti']);
  const vatIdx = xHeaderIndex(headers, ['purchase_vat_rate','vat','kdv','alis_kdv','alis_kdv_orani']);
  const dateIdx = xHeaderIndex(headers, ['valid_from','date','tarih','gecerlilik_tarihi']);
  if (productIdx < 0 || costIdx < 0) throw new Error('CSV içinde ürün ID/barkod ve maliyet sütunları zorunlu.');

  const today = xIstanbulDate();
  const seen = new Set();
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = xParseCsvLine(lines[i], delimiter);
    const rowNo = i + 1;
    const productId = String(cells[productIdx] || '').trim();
    const cost = xParseLocalizedNumber(cells[costIdx], delimiter);
    const vat = vatIdx >= 0 && String(cells[vatIdx] || '').trim() ? xParseLocalizedNumber(cells[vatIdx], delimiter) : 20;
    const validFrom = dateIdx >= 0 && String(cells[dateIdx] || '').trim() ? String(cells[dateIdx]).trim() : today;
    if (!productId || productId.length > 180) throw new Error(`${rowNo}. satır: geçerli ürün ID/barkod gerekli.`);
    if (!Number.isFinite(cost) || cost < 0 || cost > 100000000) throw new Error(`${rowNo}. satır: maliyet geçersiz.`);
    if (!Number.isFinite(vat) || vat < 0 || vat > 100) throw new Error(`${rowNo}. satır: KDV 0–100 arasında olmalı.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom) || Number.isNaN(Date.parse(`${validFrom}T00:00:00Z`))) throw new Error(`${rowNo}. satır: tarih YYYY-MM-DD olmalı.`);
    const key = `${productId}\u0000${validFrom}`;
    if (seen.has(key)) throw new Error(`${rowNo}. satır: aynı ürün ve tarih dosyada tekrar ediyor.`);
    seen.add(key);
    items.push({ external_product_id: productId, cost_amount: cost, purchase_vat_rate: vat, valid_from: validFrom });
  }
  return items;
}

function xBulkError(error) {
  const code = String(error?.message || 'UNKNOWN');
  const map = {
    EMPTY_BATCH: 'Dosyada aktarılacak kayıt yok.',
    BATCH_TOO_LARGE: `En fazla ${BULK_MAX_ROWS} kayıt yüklenebilir.`,
    INVALID_PRODUCT: 'Ürün ID/barkod alanlarından biri geçersiz.',
    INVALID_COST: 'Maliyet alanlarından biri geçersiz.',
    INVALID_VAT: 'KDV alanlarından biri geçersiz.',
    INVALID_DATE: 'Geçerlilik tarihlerinden biri geçersiz.',
    DUPLICATE_BATCH_VERSION: 'Aynı ürün ve tarih birden fazla kez gönderildi.',
    BULK_COST_WRITE_FAILED: 'Toplu maliyet kaydı veritabanına yazılamadı; hiçbir kısmi değişiklik uygulanmadı.'
  };
  return map[code] || humanError(error);
}

async function xReadBulkFile(file) {
  parsedBulkCosts = [];
  if (v4x.bulkCostImportBtn) v4x.bulkCostImportBtn.disabled = true;
  if (!file) {
    if (v4x.bulkCostPreview) v4x.bulkCostPreview.textContent = 'Henüz dosya seçilmedi.';
    xSetBulkNotice();
    return;
  }
  if (file.size > BULK_MAX_BYTES) {
    xSetBulkNotice('CSV dosyası en fazla 1 MB olabilir.', 'bad');
    return;
  }
  try {
    const text = await file.text();
    parsedBulkCosts = xParseBulkCsv(text);
    const products = new Set(parsedBulkCosts.map((x) => x.external_product_id)).size;
    if (v4x.bulkCostPreview) v4x.bulkCostPreview.textContent = `${parsedBulkCosts.length} satır doğrulandı · ${products} farklı ürün · ilk geçerlilik: ${parsedBulkCosts[0]?.valid_from || '—'}`;
    xSetBulkNotice('Dosya doğrulandı. Henüz veritabanına yazılmadı.', 'good');
    if (v4x.bulkCostImportBtn) v4x.bulkCostImportBtn.disabled = false;
  } catch (error) {
    parsedBulkCosts = [];
    if (v4x.bulkCostPreview) v4x.bulkCostPreview.textContent = 'Dosya doğrulanamadı.';
    xSetBulkNotice(error instanceof Error ? error.message : 'CSV okunamadı.', 'bad');
  }
}

function xDownloadTemplate() {
  const today = xIstanbulDate();
  const csv = `external_product_id;cost_amount;purchase_vat_rate;valid_from\n8690000000001;125,50;20;${today}\n`;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'karkalkan-maliyet-sablonu.csv';
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function xImportBulkCosts() {
  if (!activeConnectionId) { xSetBulkNotice('Önce mağaza bağlantısı seç.', 'bad'); return; }
  if (!parsedBulkCosts.length) { xSetBulkNotice('Önce geçerli bir CSV dosyası seç.', 'bad'); return; }
  setBusy(v4x.bulkCostImportBtn, true, 'İçe aktarılıyor…');
  xSetBulkNotice('Maliyetler tek işlemde kaydediliyor…');
  try {
    const data = await functionRequest('product-costs-bulk', {
      method: 'POST',
      body: { connection_id: activeConnectionId, items: parsedBulkCosts }
    });
    xSetBulkNotice(`${Number(data.upserted || 0).toLocaleString('tr-TR')} maliyet sürümü kaydedildi · ${Number(data.updatedMetrics || 0).toLocaleString('tr-TR')} ürün metriği yeniden hesaplandı.`, 'good');
    parsedBulkCosts = [];
    if (v4x.bulkCostFile) v4x.bulkCostFile.value = '';
    if (v4x.bulkCostPreview) v4x.bulkCostPreview.textContent = 'Aktarım tamamlandı.';
    await refreshConnectionData();
  } catch (error) {
    xSetBulkNotice(xBulkError(error), 'bad');
  } finally {
    setBusy(v4x.bulkCostImportBtn, false);
    if (!parsedBulkCosts.length && v4x.bulkCostImportBtn) v4x.bulkCostImportBtn.disabled = true;
  }
}

xCreateUi();

const coreRenderDashboard = renderDashboard;
renderDashboard = function enhancedRenderDashboard(data) {
  coreRenderDashboard(data);
  xRenderProfit(data);
};

const coreResetDashboardOnly = resetDashboardOnly;
resetDashboardOnly = function enhancedResetDashboardOnly() {
  coreResetDashboardOnly();
  xReset();
};

const coreRefreshConnectionData = refreshConnectionData;
refreshConnectionData = async function enhancedRefreshConnectionData() {
  await coreRefreshConnectionData();
  await xLoadCostLedger();
};

v4x.jumpToMissingCostsBtn?.addEventListener('click', () => {
  const first = v4x.needsCostBody?.querySelector('[data-cost-product]');
  if (first instanceof HTMLElement) { first.click(); return; }
  document.getElementById('costs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
v4x.bulkCostFile?.addEventListener('change', () => xReadBulkFile(v4x.bulkCostFile.files?.[0] || null));
v4x.bulkCostTemplateBtn?.addEventListener('click', xDownloadTemplate);
v4x.bulkCostImportBtn?.addEventListener('click', xImportBulkCosts);

document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const costButton = target.closest('[data-cost-product]');
  if (costButton instanceof HTMLElement) {
    const productId = String(costButton.dataset.costProduct || '').trim();
    if (!productId) return;
    els.costProductId.value = productId;
    document.getElementById('costs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => els.costAmount.focus(), 350);
    return;
  }

  const deleteButton = target.closest('[data-delete-cost]');
  if (!(deleteButton instanceof HTMLButtonElement)) return;
  const id = String(deleteButton.dataset.deleteCost || '');
  if (!id || !activeConnectionId) return;
  setBusy(deleteButton, true, 'Siliniyor…');
  setNotice(els.costMessage);
  try {
    await functionRequest('product-costs', { method: 'DELETE', query: { id } });
    setNotice(els.costMessage, 'Maliyet kaydı silindi ve ürün kârı yeniden hesaplandı.', 'good');
    await refreshConnectionData();
  } catch (error) {
    setNotice(els.costMessage, humanError(error), 'bad');
    setBusy(deleteButton, false);
  }
});

/* If the core boot completed before this progressive layer loaded, hydrate the ledger once. */
if (typeof activeConnectionId === 'string' && activeConnectionId) xLoadCostLedger().catch(() => {});
