'use strict';

/*
 * KârKalkan signup hardening for the hosted Supabase Free plan.
 * New-account passwords are checked locally for strength and against the
 * public Have I Been Pwned Pwned Passwords range API using k-anonymity.
 * The plaintext password and full SHA-1 hash never leave the browser.
 */
(function installSignupGuard() {
  if (typeof authRequest !== 'function' || typeof humanError !== 'function') return;

  const coreAuthRequest = authRequest;
  const coreHumanError = humanError;
  const passwordInput = document.getElementById('authPassword');

  // Existing accounts may have been created under the previous 8-char rule.
  // Keep sign-in backward compatible; stronger rules apply only to new signup.
  if (passwordInput) {
    passwordInput.minLength = 8;
    passwordInput.placeholder = 'Şifren';
  }

  function strongEnough(password) {
    return password.length >= 12 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password);
  }

  async function sha1Hex(value) {
    if (!globalThis.crypto?.subtle || typeof TextEncoder !== 'function') {
      throw new Error('PASSWORD_CHECK_UNAVAILABLE');
    }
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-1', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  async function pwnedCount(password) {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    let response;
    try {
      response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        method: 'GET',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal
      });
    } catch {
      throw new Error('PASSWORD_CHECK_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error('PASSWORD_CHECK_UNAVAILABLE');
    const rows = (await response.text()).split(/\r?\n/);
    for (const row of rows) {
      const split = row.indexOf(':');
      if (split <= 0) continue;
      if (row.slice(0, split).trim().toUpperCase() === suffix) {
        const count = Number(row.slice(split + 1).trim());
        return Number.isFinite(count) ? count : 1;
      }
    }
    return 0;
  }

  authRequest = async function securedAuthRequest(path, options = {}) {
    const isSignup = String(path || '').startsWith('/auth/v1/signup');
    const password = typeof options?.body?.password === 'string' ? options.body.password : '';
    if (isSignup && password) {
      if (!strongEnough(password)) throw new Error('PASSWORD_TOO_WEAK');
      if (await pwnedCount(password) > 0) throw new Error('PASSWORD_COMPROMISED');
    }
    return coreAuthRequest(path, options);
  };

  humanError = function securedHumanError(error) {
    const code = String(error?.message || '');
    if (code === 'PASSWORD_TOO_WEAK') return 'Yeni hesap şifresi en az 12 karakter olmalı; büyük harf, küçük harf, rakam ve sembol içermeli.';
    if (code === 'PASSWORD_COMPROMISED') return 'Bu şifre bilinen veri sızıntılarında görülmüş. Farklı ve benzersiz bir şifre seç.';
    if (code === 'PASSWORD_CHECK_UNAVAILABLE') return 'Şifre güvenlik kontrolü şu anda tamamlanamadı. Hesap oluşturma güvenlik nedeniyle durduruldu.';
    return coreHumanError(error);
  };
})();

// Dynamic dashboard modules are created by later scripts. Rewrite only their
// seller-facing labels after those scripts have initialized; internal financial
// field names remain unchanged so calculations and API contracts are untouched.
setTimeout(() => {
  const setText = (selector, text) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  };

  setText('#trendPanel .eyebrow', 'GÜNLÜK HAREKET');
  setText('#trendPanel h3', 'Günlük satış hareketi');
  setText('#trendPanel .trend-head .muted', 'Satışlarını, sana kalan tutarı ve iadeleri seçtiğin dönemde karşılaştır.');

  setText('#financeTruthPanel .eyebrow', 'KESİNTİLER VE HAKEDİŞ');
  setText('#financeTruthPanel h3', 'Bilinen platform kesintileri');
  setText('#financeTruthPanel .panel-title-row > .muted', 'Bu görünüm resmi net kâr değildir; bilinen kesintileri ayrı ayrı gösterir.');

  const labelMap = new Map([
    ['Settlement sonrası hakediş', 'Düzeltmeler sonrası kalan'],
    ['Platform hizmet bedeli', 'Platform hizmet bedeli'],
    ['Bilinen ücretler sonrası hakediş', 'Bilinen kesintiler sonrası kalan'],
    ['Adet veri güveni', 'Ürün adedi veri durumu']
  ]);
  document.querySelectorAll('#financeTruthPanel .kpi > span').forEach((node) => {
    const replacement = labelMap.get(node.textContent.trim());
    if (replacement) node.textContent = replacement;
  });

  setText('#ruleAlertPanel .eyebrow', 'DİKKAT ETMEN GEREKENLER');
  setText('#ruleAlertPanel h3', 'Kesintiler ve uyarılar');
  setText('#ruleAlertPanel .panel-title-row > .muted', 'Mağaza verindeki önemli değişiklikleri ve eksikleri öne çıkarır.');

  const alertMap = new Map([
    ['Stopaj', 'Kesilen vergi (stopaj)'],
    ['Cargo invoice', 'Kargo faturası'],
    ['Allocated cargo', 'Ürünlere dağıtılan kargo'],
    ['Known cash after fees', 'Bilinen kesintiler sonrası kalan']
  ]);
  document.querySelectorAll('#ruleAlertPanel span, #ruleAlertPanel strong').forEach((node) => {
    const replacement = alertMap.get(node.textContent.trim());
    if (replacement) node.textContent = replacement;
  });
}, 0);
