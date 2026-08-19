'use strict';

(() => {
  const syncButton = document.getElementById('syncBtn');
  if (!syncButton) return;

  function formatCount(value) {
    return Number(value || 0).toLocaleString('tr-TR');
  }

  syncButton.addEventListener('click', async (event) => {
    const connection = typeof selectedConnection === 'function' ? selectedConnection() : null;
    if (connection?.marketplace !== 'trendyol') return;

    // v4.js has the generic provider sync listener. Trendyol needs one extra
    // financial stage, so intercept this provider only and keep the generic
    // handler unchanged for Hepsiburada, n11 and Amazon.
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!activeConnectionId) {
      setNotice(els.syncMessage, 'Önce bağlantı seç.', 'bad');
      return;
    }

    const days = Number(els.rangeDays.value);
    setBusy(els.syncBtn, true, 'Trendyol eşitleniyor…');
    setNotice(els.syncMessage, '1/2 · Sipariş, iade, komisyon ve finans hareketleri alınıyor…');

    try {
      const core = await functionRequest('trendyol-sync', {
        method: 'POST',
        body: { connection_id: activeConnectionId, days }
      });

      setNotice(els.syncMessage, '2/2 · Platform hizmet bedeli, stopaj ve kargo faturaları uzlaştırılıyor…');
      const auxiliary = await functionRequest('trendyol-otherfinancials-sync', {
        method: 'POST',
        body: { connection_id: activeConnectionId, days }
      });

      if (auxiliary?.cargoOk !== true || auxiliary?.orderMapOk !== true) {
        const detail = [auxiliary?.cargoWarning, auxiliary?.orderMapWarning].filter(Boolean).join(' · ');
        setNotice(
          els.syncMessage,
          `Ana finans verisi işlendi ancak kargo uzlaştırması tamamlanmadı${detail ? `: ${detail}` : '.'} Finans kapsamını tam saymadan yeniden deneyin.`,
          'bad'
        );
      } else {
        setNotice(
          els.syncMessage,
          `Trendyol tam senkron tamamlandı: ${formatCount(core?.importedTransactions)} finans hareketi · ${formatCount(auxiliary?.cargoItems)} kargo kalemi · ${formatCount(auxiliary?.cargoAllocations)} ürün-kargo eşlemesi.`,
          'good'
        );
      }

      await loadConnections();
    } catch (error) {
      setNotice(els.syncMessage, humanError(error), 'bad');
      await refreshConnectionData().catch(() => {});
    } finally {
      setBusy(els.syncBtn, false);
    }
  }, { capture: true });
})();
