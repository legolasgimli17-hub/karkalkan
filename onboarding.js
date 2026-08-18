'use strict';

(() => {
  if (window.KKGuidedOnboarding) return;

  const strip = document.querySelector('.onboarding-strip');
  const appPanel = document.getElementById('appPanel');
  if (!strip || !appPanel) return;

  const stepConfig = [
    { key: 'store', target: '#connections', label: 'Kanalı bağla' },
    { key: 'data', target: '#credentials', label: 'Veriyi getir' },
    { key: 'cost', target: '#costs', label: 'Maliyeti ekle' },
    { key: 'decision', target: '#dashboard', label: 'Sonucu incele' }
  ];
  const stepNodes = new Map(stepConfig.map((step) => [step.key, strip.querySelector(`[data-setup-step="${step.key}"]`)]));

  // Keep the compact strip, but make its labels match measurable activation steps.
  const costStrong = stepNodes.get('cost')?.querySelector('strong');
  const costSmall = stepNodes.get('cost')?.querySelector('small');
  const decisionStrong = stepNodes.get('decision')?.querySelector('strong');
  const decisionSmall = stepNodes.get('decision')?.querySelector('small');
  if (costStrong) costStrong.textContent = 'Maliyeti ekle';
  if (costSmall) costSmall.textContent = 'İlk ürün katkısını hesapla.';
  if (decisionStrong) decisionStrong.textContent = 'Sonucu incele';
  if (decisionSmall) decisionSmall.textContent = 'Kârlılık görünümünü aç.';

  const guide = document.createElement('section');
  guide.id = 'guidedOnboarding';
  guide.className = 'panel onboarding-guide';
  guide.setAttribute('aria-live', 'polite');

  const copy = document.createElement('div');
  copy.className = 'onboarding-guide-copy';
  const top = document.createElement('div');
  top.className = 'onboarding-guide-top';
  const kicker = document.createElement('span');
  kicker.textContent = 'HIZLI KURULUM';
  const progressLabel = document.createElement('span');
  progressLabel.className = 'onboarding-progress-label';
  progressLabel.textContent = 'Durum okunuyor…';
  top.append(kicker, progressLabel);

  const title = document.createElement('h3');
  title.textContent = 'Çalışma alanını hazırlıyoruz.';
  const description = document.createElement('p');
  description.textContent = 'Mağaza durumun kontrol ediliyor.';
  const progressWrap = document.createElement('div');
  progressWrap.className = 'onboarding-progress';
  const progress = document.createElement('progress');
  progress.max = 100;
  progress.value = 0;
  progress.setAttribute('aria-label', 'Kurulum ilerlemesi');
  const progressMeta = document.createElement('small');
  progressMeta.textContent = '0 / 4 adım';
  progressWrap.append(progress, progressMeta);
  copy.append(top, title, description, progressWrap);

  const actions = document.createElement('div');
  actions.className = 'onboarding-guide-actions';
  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'btn primary';
  nextButton.textContent = 'Başla';
  const refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.className = 'btn ghost onboarding-refresh';
  refreshButton.textContent = 'Yenile';
  refreshButton.setAttribute('aria-label', 'Kurulum durumunu yenile');
  actions.append(nextButton, refreshButton);
  guide.append(copy, actions);
  strip.after(guide);

  let currentAction = { target: '#connections', focus: '#marketplaceSelect' };
  let onboardingRefreshPromise = null;
  let refreshTimer = 0;
  let lastState = null;

  function activeConnection() {
    try {
      return typeof selectedConnection === 'function' ? selectedConnection() : null;
    } catch {
      return null;
    }
  }

  function safeConnections() {
    try {
      return Array.isArray(connections) ? connections : [];
    } catch {
      return [];
    }
  }

  function providerLabel(connection) {
    if (!connection) return 'Mağaza';
    try {
      const provider = Array.isArray(providerCatalog) ? providerCatalog.find((item) => item.key === connection.marketplace) : null;
      return provider?.label || String(connection.marketplace || 'Mağaza');
    } catch {
      return String(connection.marketplace || 'Mağaza');
    }
  }

  function goTo(targetSelector, focusSelector = '') {
    const target = document.querySelector(targetSelector);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.remove('onboarding-target-pulse');
    void target.offsetWidth;
    target.classList.add('onboarding-target-pulse');
    setTimeout(() => target.classList.remove('onboarding-target-pulse'), 1400);
    if (focusSelector) {
      const focusTarget = document.querySelector(focusSelector);
      setTimeout(() => focusTarget?.focus?.({ preventScroll: true }), 450);
    }
  }

  function actionForStep(key) {
    const state = lastState || {};
    if (key === 'store') return { target: '#connections', focus: state.storeCount ? '#connectionSelect' : '#marketplaceSelect' };
    if (key === 'data') return state.storeComplete ? { target: '#credentials' } : { target: '#connections', focus: '#marketplaceSelect' };
    if (key === 'cost') return state.dataComplete ? { target: '#costs', focus: '#costProductId' } : state.storeComplete ? { target: '#credentials' } : { target: '#connections', focus: '#marketplaceSelect' };
    return state.costComplete ? { target: '#dashboard' } : state.dataComplete ? { target: '#costs', focus: '#costProductId' } : state.storeComplete ? { target: '#credentials' } : { target: '#connections', focus: '#marketplaceSelect' };
  }

  for (const step of stepConfig) {
    const node = stepNodes.get(step.key);
    if (!node) continue;
    node.setAttribute('role', 'button');
    node.tabIndex = 0;
    const activate = () => {
      const action = actionForStep(step.key);
      goTo(action.target, action.focus);
    };
    node.addEventListener('click', activate);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  }

  async function readActivationState() {
    const stores = safeConnections();
    const connection = activeConnection();
    const storeComplete = stores.length > 0;
    const dataComplete = Boolean(connection?.last_sync_at && connection?.last_sync_status === 'success');
    let costCount = 0;
    let summaryTransactions = 0;
    let costCoverage = null;
    let detailReadFailed = false;

    if (connection?.id && dataComplete && typeof functionRequest === 'function') {
      const [costResult, summaryResult] = await Promise.allSettled([
        functionRequest('product-costs', { query: { connection_id: connection.id } }),
        functionRequest('dashboard-summary', { query: { connection_id: connection.id, days: '30' } })
      ]);
      if (costResult.status === 'fulfilled') costCount = Array.isArray(costResult.value?.costs) ? costResult.value.costs.length : 0;
      else detailReadFailed = true;
      if (summaryResult.status === 'fulfilled') {
        summaryTransactions = Number(summaryResult.value?.totals?.transactions || 0);
        const parsedCoverage = Number(summaryResult.value?.costCoverage);
        costCoverage = Number.isFinite(parsedCoverage) ? parsedCoverage : null;
      } else detailReadFailed = true;
    }

    const costComplete = dataComplete && costCount > 0;
    const decisionComplete = costComplete && summaryTransactions > 0;
    return {
      storeCount: stores.length,
      connection,
      storeComplete,
      dataComplete,
      costComplete,
      decisionComplete,
      costCount,
      summaryTransactions,
      costCoverage,
      detailReadFailed
    };
  }

  function renderState(state) {
    lastState = state;
    const completed = [state.storeComplete, state.dataComplete, state.costComplete, state.decisionComplete].filter(Boolean).length;
    const percent = completed / stepConfig.length * 100;
    progress.value = percent;
    progressMeta.textContent = `${completed} / ${stepConfig.length} adım`;
    progressLabel.textContent = completed === stepConfig.length ? 'Kurulum tamamlandı' : `%${Math.round(percent)} tamamlandı`;
    guide.classList.toggle('is-complete', completed === stepConfig.length);

    let activeKey = 'store';
    if (state.storeComplete) activeKey = 'data';
    if (state.dataComplete) activeKey = 'cost';
    if (state.costComplete) activeKey = 'decision';

    for (const step of stepConfig) {
      const node = stepNodes.get(step.key);
      if (!node) continue;
      const complete = Boolean(state[`${step.key}Complete`]);
      const stepIndex = stepConfig.findIndex((item) => item.key === step.key);
      const activeIndex = stepConfig.findIndex((item) => item.key === activeKey);
      node.classList.toggle('is-complete', complete);
      node.classList.toggle('is-active', !complete && step.key === activeKey);
      node.classList.toggle('is-locked', !complete && stepIndex > activeIndex);
      node.setAttribute('aria-current', !complete && step.key === activeKey ? 'step' : 'false');
      node.setAttribute('aria-label', `${step.label}: ${complete ? 'tamamlandı' : step.key === activeKey ? 'sıradaki adım' : 'daha sonra'}`);
    }

    if (!state.storeComplete) {
      title.textContent = 'İlk satış kanalını bağla.';
      description.textContent = 'Trendyol, Hepsiburada, n11, Amazon veya FLO çalışma alanını oluştur; sonraki adımları KârKalkan mağaza durumundan otomatik takip eder.';
      nextButton.textContent = 'Kanal ekle';
      currentAction = { target: '#connections', focus: '#marketplaceSelect' };
      return;
    }

    if (!state.connection) {
      title.textContent = 'Devam edeceğin mağazayı seç.';
      description.textContent = `${state.storeCount} mağaza bağlı. Veri ve maliyet adımları seçili mağazaya göre izlenir.`;
      nextButton.textContent = 'Mağaza seç';
      currentAction = { target: '#connections', focus: '#connectionSelect' };
      return;
    }

    const label = providerLabel(state.connection);
    if (!state.dataComplete) {
      title.textContent = `${label} için ilk veriyi getir.`;
      description.textContent = 'Resmî API bağlantısını kullanabilir veya standart finans CSV’sini içe aktarabilirsin. Başarılı ilk senkron bu adımı otomatik tamamlar.';
      nextButton.textContent = 'Veri erişimine git';
      currentAction = { target: '#credentials' };
      return;
    }

    if (!state.costComplete) {
      title.textContent = 'Veri geldi. İlk ürün maliyetini ekle.';
      description.textContent = 'Pazaryeri ürünün alış maliyetini bilmez. En az bir ürün maliyeti eklediğinde KârKalkan ilk katkı hesabını açar.';
      nextButton.textContent = 'Maliyet ekle';
      currentAction = { target: '#costs', focus: '#costProductId' };
      return;
    }

    if (!state.decisionComplete) {
      title.textContent = 'Maliyet hazır. Sonuç görünümünü tamamla.';
      description.textContent = state.detailReadFailed ? 'Kurulum verisinin bir bölümü şu anda okunamadı. Durumu yeniden kontrol et.' : `${state.costCount} maliyet kaydı bulundu; son 30 günlük ürün hareketi geldiğinde karar özeti hazır olacak.`;
      nextButton.textContent = 'Karar özetine git';
      currentAction = { target: '#dashboard' };
      return;
    }

    title.textContent = 'İlk kurulum tamamlandı.';
    const coverage = state.costCoverage == null ? '' : ` Maliyet kapsamı %${Math.round(state.costCoverage * 100)}.`;
    description.textContent = `${label} için veri ve ürün maliyeti bulundu.${coverage} Şimdi zarar/risk sinyallerini ve TL etkisini karar özetinden inceleyebilirsin.`;
    nextButton.textContent = 'Sonuçları aç';
    currentAction = { target: '#dashboard' };
  }

  async function refreshOnboarding() {
    if (appPanel.classList.contains('hide')) return;
    if (onboardingRefreshPromise) return onboardingRefreshPromise;
    onboardingRefreshPromise = (async () => {
      try {
        renderState(await readActivationState());
      } catch {
        if (!lastState) {
          title.textContent = 'Kurulum durumu okunamadı.';
          description.textContent = 'Mağaza verilerini yenileyip tekrar dene.';
        }
      } finally {
        onboardingRefreshPromise = null;
      }
    })();
    return onboardingRefreshPromise;
  }

  function queueRefresh(delay = 180) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshOnboarding().catch(() => {}), delay);
  }

  nextButton.addEventListener('click', () => goTo(currentAction.target, currentAction.focus));
  refreshButton.addEventListener('click', async () => {
    if (typeof setBusy === 'function') setBusy(refreshButton, true, 'Kontrol…');
    try {
      if (typeof loadConnections === 'function') await loadConnections();
      else await refreshOnboarding();
    } finally {
      if (typeof setBusy === 'function') setBusy(refreshButton, false);
    }
  });

  document.getElementById('connectionSelect')?.addEventListener('change', () => queueRefresh(350));

  if (typeof loadConnections === 'function') {
    const coreLoadConnections = loadConnections;
    loadConnections = async function guidedLoadConnections(...args) {
      const result = await coreLoadConnections(...args);
      queueRefresh();
      return result;
    };
  }

  if (typeof refreshConnectionData === 'function') {
    const coreRefreshConnectionData = refreshConnectionData;
    refreshConnectionData = async function guidedRefreshConnectionData(...args) {
      const result = await coreRefreshConnectionData(...args);
      queueRefresh();
      return result;
    };
  }

  const appObserver = new MutationObserver(() => {
    if (!appPanel.classList.contains('hide')) queueRefresh(80);
  });
  appObserver.observe(appPanel, { attributes: true, attributeFilter: ['class'] });

  window.KKGuidedOnboarding = { refresh: refreshOnboarding, goTo };
  if (!appPanel.classList.contains('hide')) queueRefresh(50);
})();
