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
    let response;
    try {
      response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        method: 'GET',
        cache: 'no-store',
        referrerPolicy: 'no-referrer'
      });
    } catch {
      throw new Error('PASSWORD_CHECK_UNAVAILABLE');
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
