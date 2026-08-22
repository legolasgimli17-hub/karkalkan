'use strict';

(() => {
  const syncButton = document.getElementById('syncBtn');
  if (!syncButton) return;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function formatCount(value) {
    return Number(value || 0).toLocaleString('tr-TR');
  }

  function jobLabel(job) {
    const completed = Number(job?.completedChunks || 0);
    const total = Number(job?.totalChunks || 0);
    const chunk = job?.currentChunk;
    const range = chunk?.start && chunk?.end ? ` · ${chunk.start} → ${chunk.end}` : '';
    return `${completed}/${total || '?'} parça tamamlandı${range}`;
  }

  function resumableError(error) {
    const code = String(error?.message || 'UNKNOWN');
    const map = {
      SYNC_JOB_BUSY: 'Bu mağazanın senkronu başka bir istek tarafından işleniyor. Biraz sonra tekrar deneyin.',
      SYNC_CHUNK_BUSY: 'Bu veri parçası başka bir istek tarafından işleniyor. Biraz sonra tekrar deneyin.',
      SYNC_JOB_RANGE_CONFLICT: 'Bu mağaza için daha önce başlayan farklı dönemli senkron tamamlanmayı bekliyor.',
      SYNC_JOB_FAILED: 'Kaydedilmiş senkron işi hata durumunda. Bağlantı durumunu kontrol edip yeniden deneyin.',
      RATE_LIMITED: 'Senkron kullanım sınırına ulaşıldı. Daha sonra yeniden deneyin.',
      AUXILIARY_INCOMPLETE: 'Ana finans verisi geldi ancak kargo/ürün eşlemesi tamamlanmadı; ilerleme kaydedildi.',
      ORCHESTRATOR_ERROR: 'Senkron ilerlemesi kaydedildi ancak yürütücü geçici bir hata aldı. Tekrar deneyebilirsiniz.'
    };
    return map[code] || humanError(error);
  }

  syncButton.addEventListener('click', async (event) => {
    const connection = typeof selectedConnection === 'function' ? selectedConnection() : null;
    if (connection?.marketplace !== 'trendyol') return;

    // v4.js keeps the generic provider path for other marketplaces. Trendyol
    // uses persisted bounded chunks so a long sync can resume after tab closes.
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!activeConnectionId) {
      setNotice(els.syncMessage, 'Önce bağlantı seç.', 'bad');
      return;
    }

    const days = Number(els.rangeDays.value);
    setBusy(els.syncBtn, true, 'Trendyol eşitleniyor…');
    setNotice(els.syncMessage, 'Senkron işi hazırlanıyor; ilerleme sunucuda saklanacak…');

    try {
      let last = null;
      for (let iteration = 0; iteration < 40; iteration++) {
        const result = await functionRequest('trendyol-resumable-sync', {
          method: 'POST',
          body: { connection_id: activeConnectionId, days }
        });
        last = result;
        const job = result?.job || {};

        if (job.status === 'success') {
          const chunk = result?.chunk || {};
          setNotice(
            els.syncMessage,
            `Trendyol tam senkron tamamlandı: ${jobLabel(job)} · son parçada ${formatCount(chunk.importedTransactions)} finans hareketi, ${formatCount(chunk.cargoItems)} kargo kalemi ve ${formatCount(chunk.cargoAllocations)} ürün-kargo eşlemesi.`,
            'good'
          );
          await loadConnections();
          return;
        }

        if (Number(result?.retryAfterSeconds || 0) > 0) {
          const retryAfter = Number(result.retryAfterSeconds);
          setNotice(els.syncMessage, `${jobLabel(job)} · geçici provider hatası sonrası ilerleme kaydedildi. ${retryAfter} sn sonra devam edilebilir.`);
          if (retryAfter > 20) {
            await refreshConnectionData().catch(() => {});
            return;
          }
          await sleep(Math.max(1, retryAfter) * 1000);
          continue;
        }

        setNotice(els.syncMessage, `${jobLabel(job)} · sıradaki güvenli veri parçasına geçiliyor…`);
        await sleep(250);
      }

      const guard = new Error('SYNC_JOB_CLIENT_GUARD');
      guard.payload = last;
      throw guard;
    } catch (error) {
      if (String(error?.message || '') === 'SYNC_JOB_CLIENT_GUARD') {
        setNotice(els.syncMessage, 'Senkron ilerlemesi kaydedildi ancak bu oturumdaki güvenli parça sınırına ulaşıldı. Devam etmek için tekrar senkron düğmesine basabilirsiniz.', 'bad');
      } else {
        setNotice(els.syncMessage, resumableError(error), 'bad');
      }
      await refreshConnectionData().catch(() => {});
    } finally {
      setBusy(els.syncBtn, false);
    }
  }, { capture: true });
})();