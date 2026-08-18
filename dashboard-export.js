'use strict';

(() => {
  if (window.KKDashboardExport) return;

  const actions = document.querySelector('#dashboard .dashboard-actions');
  const syncButton = document.getElementById('syncBtn');
  if (!actions || !syncButton || typeof functionRequest !== 'function') return;

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.id = 'exportDashboardCsvBtn';
  exportButton.className = 'btn ghost';
  exportButton.textContent = 'CSV indir';
  actions.insertBefore(exportButton, syncButton);

  const columns = [
    'record_type','day','marketplace','store_name','currency','transactions','product_id','sku','barcode','product_name','units',
    'gross_sales','gross_returns','commission_cost','seller_revenue','known_cogs','estimated_profit','margin_percent','cost_coverage',
    'confidence','status','financial_scope'
  ];

  function safeCsvCell(value) {
    if (value == null) return '';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    let text = String(value).replace(/[\r\n\t]+/g, ' ').trim();
    // Prevent spreadsheet formula execution from seller-controlled names/SKUs.
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  function row(type, data = {}) {
    return columns.map((column) => safeCsvCell(column === 'record_type' ? type : data[column])).join(',');
  }

  function buildCsv(data) {
    const connection = data?.connection || {};
    const currency = String(data?.currency || 'TRY');
    const totals = data?.totals || {};
    const scope = String(data?.profitSnapshot?.scope || 'dashboard_summary_not_official_accounting_profit');
    const shared = {
      marketplace: connection.marketplace || '',
      store_name: connection.display_name || '',
      currency,
      financial_scope: scope
    };
    const rows = [columns.join(',')];

    rows.push(row('summary', {
      ...shared,
      transactions: Number(totals.transactions || 0),
      gross_sales: Number(totals.grossSales || 0),
      gross_returns: Number(totals.grossReturns || 0),
      commission_cost: Number(totals.commissionCost || 0),
      seller_revenue: Number(totals.sellerRevenue || 0),
      known_cogs: data?.profitSnapshot?.coveredKnownCogs == null ? null : Number(data.profitSnapshot.coveredKnownCogs),
      estimated_profit: data?.profitSnapshot?.coveredProfit == null ? null : Number(data.profitSnapshot.coveredProfit),
      margin_percent: data?.profitSnapshot?.coveredMargin == null ? null : Number(data.profitSnapshot.coveredMargin),
      cost_coverage: data?.salesCostCoverage == null ? null : Number(data.salesCostCoverage)
    }));

    for (const daily of Array.isArray(data?.daily) ? data.daily : []) {
      rows.push(row('daily', {
        ...shared,
        day: daily.day || '',
        transactions: Number(daily.transactions || 0),
        gross_sales: Number(daily.grossSales || 0),
        gross_returns: Number(daily.grossReturns || 0),
        commission_cost: Number(daily.commissionCost || 0),
        seller_revenue: Number(daily.sellerRevenue || 0)
      }));
    }

    const appendProducts = (type, products) => {
      for (const product of Array.isArray(products) ? products : []) {
        rows.push(row(type, {
          ...shared,
          product_id: product.externalProductId || '',
          sku: product.sku || '',
          barcode: product.barcode || '',
          product_name: product.name || '',
          units: Number(product.units || 0),
          gross_sales: Number(product.grossSales || 0),
          gross_returns: Number(product.grossReturns || 0),
          commission_cost: Number(product.commissionCost || 0),
          seller_revenue: Number(product.sellerRevenue || 0),
          known_cogs: product.knownCogs == null ? null : Number(product.knownCogs),
          estimated_profit: product.estimatedProfit == null ? null : Number(product.estimatedProfit),
          margin_percent: product.margin == null ? null : Number(product.margin),
          cost_coverage: product.costCoverage == null ? null : Number(product.costCoverage),
          confidence: product.confidence || '',
          status: product.status || ''
        }));
      }
    };
    appendProducts('critical_product', data?.products?.worst);
    appendProducts('missing_cost_product', data?.products?.needsCost);

    return `\uFEFF${rows.join('\r\n')}\r\n`;
  }

  function downloadCsv(csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `karkalkan-dashboard-${today}.csv`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  exportButton.addEventListener('click', async () => {
    if (!activeConnectionId) {
      setNotice(els.syncMessage, 'CSV indirmek için önce bir mağaza seç.', 'bad');
      return;
    }
    setBusy(exportButton, true, 'Hazırlanıyor…');
    try {
      const days = String(els?.rangeDays?.value || '30');
      const data = await functionRequest('dashboard-summary', { query: { connection_id: activeConnectionId, days } });
      downloadCsv(buildCsv(data));
      setNotice(els.syncMessage, `Dashboard CSV dosyası hazırlandı · son ${days} gün.`, 'good');
    } catch (error) {
      setNotice(els.syncMessage, `CSV hazırlanamadı: ${humanError(error)}`, 'bad');
    } finally {
      setBusy(exportButton, false);
    }
  });

  window.KKDashboardExport = { buildCsv };
})();
