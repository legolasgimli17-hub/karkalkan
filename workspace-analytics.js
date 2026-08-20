'use strict';

(() => {
  // Static workspace scripts are intentionally same-origin and CSP constrained.
  // Load provider-specific orchestration and evidence-bound product modules
  // after v4.js has installed the shared auth/function helpers. Failure here
  // must not break the core workspace.
  void import('/trendyol-sync-pipeline.js?v=20260819').catch(() => {});
  void import('/finance-ai.js?v=20260821').catch(() => {});
  void import('/smart-csv.js?v=20260821').catch(() => {});
  void import('/fx-import.js?v=20260821').catch(() => {});

  const ONBOARDING_STAGES = new Set(['store', 'data', 'cost', 'decision', 'complete']);
  const TARGET_STEPS = new Set(['store', 'data', 'cost', 'decision']);
  const BACKEND_EVENTS = new Map([
    ['Onboarding Stage Viewed', 'onboarding_stage_viewed'],
    ['Onboarding Completed', 'onboarding_completed'],
    ['Onboarding Next Clicked', 'onboarding_next_clicked'],
    ['Onboarding Step Clicked', 'onboarding_step_clicked']
  ]);
  const SESSION_STAGE_KEY = 'karkalkan.analytics.onboarding-stage.v1';
  const SESSION_COMPLETE_KEY = 'karkalkan.analytics.onboarding-complete.v1';

  // Vercel Web Analytics provides page views on every Vercel plan and custom
  // events where the account supports them. The Supabase aggregate endpoint
  // below is the plan-independent source of truth for the activation funnel.
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };

  // The authenticated workspace can receive temporary OAuth/recovery query
  // values. Analytics never needs them, so report only the canonical route.
  window.va('beforeSend', (event) => {
    try {
      const next = { ...event };
      const url = new URL(String(event?.url || location.href), location.origin);
      if (url.pathname === '/uygulama' || url.pathname === '/v4.html') {
        url.pathname = '/uygulama';
        url.search = '';
        url.hash = '';
        next.url = url.toString();
      }
      return next;
    } catch {
      return event;
    }
  });

  function normalizedAggregatePayload(name, data) {
    const eventName = BACKEND_EVENTS.get(name);
    if (!eventName) return null;
    const stage = ONBOARDING_STAGES.has(String(data.stage || '')) ? String(data.stage) : 'none';
    const completedSteps = Number(data.completedSteps);
    const targetStep = TARGET_STEPS.has(String(data.targetStep || '')) ? String(data.targetStep) : 'none';
    return {
      event_name: eventName,
      stage,
      completed_steps: Number.isInteger(completedSteps) && completedSteps >= 0 && completedSteps <= 4 ? completedSteps : 0,
      target_step: targetStep
    };
  }

  function safeTrack(name, data = {}) {
    try {
      window.va('event', { name, data });
    } catch {
      // Vercel analytics must never block the product flow.
    }

    const payload = normalizedAggregatePayload(name, data);
    if (payload && typeof functionRequest === 'function') {
      void functionRequest('product-analytics', { method: 'POST', body: payload }).catch(() => {});
    }
  }

  function readFunnelState() {
    const steps = [...document.querySelectorAll('.onboarding-strip [data-setup-step]')];
    if (steps.length !== 4) return null;
    const completedSteps = steps.filter((node) => node.classList.contains('is-complete')).length;
    const activeNode = steps.find((node) => node.classList.contains('is-active'));
    const activeStage = String(activeNode?.dataset?.setupStep || '');
    const stage = completedSteps === 4 ? 'complete' : activeStage;
    if (!ONBOARDING_STAGES.has(stage)) return null;
    return { stage, completedSteps };
  }

  function trackFunnelState() {
    const state = readFunnelState();
    if (!state) return;
    const token = `${state.stage}:${state.completedSteps}`;
    let previous = '';
    try { previous = sessionStorage.getItem(SESSION_STAGE_KEY) || ''; } catch { /* session storage may be unavailable */ }
    if (previous === token) return;

    safeTrack('Onboarding Stage Viewed', {
      stage: state.stage,
      completedSteps: state.completedSteps
    });
    try { sessionStorage.setItem(SESSION_STAGE_KEY, token); } catch { /* non-critical */ }

    if (state.stage === 'complete') {
      let completeSeen = false;
      try { completeSeen = sessionStorage.getItem(SESSION_COMPLETE_KEY) === '1'; } catch { /* non-critical */ }
      if (!completeSeen) {
        safeTrack('Onboarding Completed', { stage: 'complete', completedSteps: 4 });
        try { sessionStorage.setItem(SESSION_COMPLETE_KEY, '1'); } catch { /* non-critical */ }
      }
    }
  }

  function currentFunnelState() {
    return readFunnelState() || { stage: 'store', completedSteps: 0 };
  }

  function bindActions() {
    const guide = document.getElementById('guidedOnboarding');
    const primary = guide?.querySelector('.onboarding-guide-actions .btn.primary');
    if (primary) {
      primary.addEventListener('click', () => {
        const state = currentFunnelState();
        safeTrack('Onboarding Next Clicked', { stage: state.stage, completedSteps: state.completedSteps });
      });
    }

    document.querySelectorAll('.onboarding-strip [data-setup-step]').forEach((node) => {
      node.addEventListener('click', () => {
        const targetStep = String(node.dataset.setupStep || '');
        if (TARGET_STEPS.has(targetStep)) {
          const state = currentFunnelState();
          safeTrack('Onboarding Step Clicked', { stage: state.stage, completedSteps: state.completedSteps, targetStep });
        }
      });
    });
  }

  const strip = document.querySelector('.onboarding-strip');
  const appPanel = document.getElementById('appPanel');
  if (!strip || !appPanel) return;

  bindActions();
  const observer = new MutationObserver(() => {
    if (!appPanel.classList.contains('hide')) trackFunnelState();
  });
  observer.observe(strip, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-current'] });
  observer.observe(appPanel, { attributes: true, attributeFilter: ['class'] });

  if (!appPanel.classList.contains('hide')) queueMicrotask(trackFunnelState);
})();
