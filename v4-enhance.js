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
  jumpToMissingCostsBtn: document.getElementById('jumpToMissingCostsBtn')
};

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
      const values = [
        String(cost.external_product_id || '—'),
        formatMoney(cost.cost_amount, 'TRY'),
        formatPercent(cost.purchase_vat_rate),
        validText
      ];
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
  if (first instanceof HTMLElement) {
    first.click();
    return;
  }
  document.getElementById('costs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

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
if (typeof activeConnectionId === 'string' && activeConnectionId) {
  xLoadCostLedger().catch(() => {});
}
