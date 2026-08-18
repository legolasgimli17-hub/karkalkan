'use strict';

/*
 * KârKalkan auth hardening for the hosted Supabase Free plan.
 * New-account and password-recovery passwords are checked locally for strength
 * and against the public Have I Been Pwned Pwned Passwords range API using
 * k-anonymity. The plaintext password and full SHA-1 hash never leave the browser.
 */
(function installAuthSecurity() {
  if (typeof authRequest !== 'function' || typeof humanError !== 'function') return;

  const coreAuthRequest = authRequest;
  const coreHumanError = humanError;
  const passwordInput = document.getElementById('authPassword');
  const authForm = document.getElementById('authForm');
  const authMessage = document.getElementById('authMessage');
  const authPanel = document.getElementById('authPanel');
  const appPanel = document.getElementById('appPanel');
  const authCard = authForm?.closest('.auth-card');
  const authCardTitle = authCard?.querySelector('.auth-card-head h3');
  const authCardCopy = authCard?.querySelector('.auth-card-head p');
  const RECOVERY_KEY = 'karkalkan.v4.recovery';
  let recoverySession = null;

  // Existing accounts may have been created under the previous 8-char rule.
  // Keep sign-in backward compatible; stronger rules apply to signup and reset.
  if (passwordInput) {
    passwordInput.minLength = 8;
    passwordInput.placeholder = 'Şifren';
  }

  function strongEnough(password) {
    return password.length >= 12 &&
      password.length <= 128 &&
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
    const normalizedPath = String(path || '');
    const method = String(options?.method || 'POST').toUpperCase();
    const password = typeof options?.body?.password === 'string' ? options.body.password : '';
    const isSignup = normalizedPath.startsWith('/auth/v1/signup');
    const isPasswordUpdate = normalizedPath.startsWith('/auth/v1/user') && method === 'PUT';
    if ((isSignup || isPasswordUpdate) && password) {
      if (!strongEnough(password)) throw new Error('PASSWORD_TOO_WEAK');
      if (await pwnedCount(password) > 0) throw new Error('PASSWORD_COMPROMISED');
    }
    return coreAuthRequest(path, options);
  };

  humanError = function securedHumanError(error) {
    const code = String(error?.message || '');
    if (code === 'PASSWORD_TOO_WEAK') return 'Şifre en az 12 karakter olmalı; büyük harf, küçük harf, rakam ve sembol içermeli.';
    if (code === 'PASSWORD_COMPROMISED') return 'Bu şifre bilinen veri sızıntılarında görülmüş. Farklı ve benzersiz bir şifre seç.';
    if (code === 'PASSWORD_CHECK_UNAVAILABLE') return 'Şifre güvenlik kontrolü şu anda tamamlanamadı. İşlem güvenlik nedeniyle durduruldu.';
    if (code === 'PASSWORD_CONFIRMATION_MISMATCH') return 'Yeni şifreler birbiriyle eşleşmiyor.';
    if (code === 'PASSWORD_RECOVERY_INVALID') return 'Şifre yenileme bağlantısı geçersiz veya süresi dolmuş. Yeni bir bağlantı iste.';
    if (Number(error?.status) === 429) return 'Çok fazla şifre yenileme isteği gönderildi. Bir süre sonra tekrar dene.';
    return coreHumanError(error);
  };

  function validEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function writeRecoverySession(value) {
    recoverySession = value;
    if (value) sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(RECOVERY_KEY);
  }

  function readRecoverySession() {
    try {
      const raw = sessionStorage.getItem(RECOVERY_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object') return null;
      if (typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string') return null;
      if (!Number.isFinite(Number(value.expires_at))) return null;
      if (Number(value.expires_at) <= Math.floor(Date.now() / 1000)) return null;
      return value;
    } catch {
      return null;
    }
  }

  async function revokeRecoverySession() {
    const token = recoverySession?.access_token;
    try {
      if (token) {
        await coreAuthRequest('/auth/v1/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch { /* local cleanup still proceeds */ }
    writeRecoverySession(null);
  }

  async function ensureRecoveryAccessToken() {
    if (!recoverySession) throw new Error('PASSWORD_RECOVERY_INVALID');
    const now = Math.floor(Date.now() / 1000);
    if (Number(recoverySession.expires_at) - now >= 90) return recoverySession.access_token;
    if (!recoverySession.refresh_token) throw new Error('PASSWORD_RECOVERY_INVALID');
    const refreshed = await coreAuthRequest('/auth/v1/token?grant_type=refresh_token', {
      body: { refresh_token: recoverySession.refresh_token }
    });
    const expiresAt = Number(refreshed.expires_at) || now + Number(refreshed.expires_in || 3600);
    recoverySession = {
      access_token: String(refreshed.access_token || ''),
      refresh_token: String(refreshed.refresh_token || recoverySession.refresh_token),
      expires_at: expiresAt,
      email: String(refreshed.user?.email || recoverySession.email || '')
    };
    if (!recoverySession.access_token || !recoverySession.refresh_token) throw new Error('PASSWORD_RECOVERY_INVALID');
    writeRecoverySession(recoverySession);
    return recoverySession.access_token;
  }

  if (!authForm || !authMessage || !authCard) return;

  const forgotButton = document.createElement('button');
  forgotButton.className = 'btn ghost';
  forgotButton.id = 'forgotPasswordBtn';
  forgotButton.type = 'button';
  forgotButton.textContent = 'Şifremi unuttum';
  authForm.append(forgotButton);

  const recoveryPanel = document.createElement('form');
  recoveryPanel.id = 'passwordRecoveryForm';
  recoveryPanel.className = 'auth-form hide';
  recoveryPanel.noValidate = true;

  const passwordField = document.createElement('div');
  passwordField.className = 'field';
  const passwordLabel = document.createElement('label');
  passwordLabel.htmlFor = 'recoveryPassword';
  passwordLabel.textContent = 'Yeni şifre';
  const recoveryPassword = document.createElement('input');
  recoveryPassword.className = 'input';
  recoveryPassword.id = 'recoveryPassword';
  recoveryPassword.type = 'password';
  recoveryPassword.autocomplete = 'new-password';
  recoveryPassword.minLength = 12;
  recoveryPassword.maxLength = 128;
  recoveryPassword.required = true;
  recoveryPassword.placeholder = 'En az 12 karakter';
  passwordField.append(passwordLabel, recoveryPassword);

  const confirmField = document.createElement('div');
  confirmField.className = 'field';
  const confirmLabel = document.createElement('label');
  confirmLabel.htmlFor = 'recoveryPasswordConfirm';
  confirmLabel.textContent = 'Yeni şifreyi tekrar gir';
  const recoveryPasswordConfirm = document.createElement('input');
  recoveryPasswordConfirm.className = 'input';
  recoveryPasswordConfirm.id = 'recoveryPasswordConfirm';
  recoveryPasswordConfirm.type = 'password';
  recoveryPasswordConfirm.autocomplete = 'new-password';
  recoveryPasswordConfirm.minLength = 12;
  recoveryPasswordConfirm.maxLength = 128;
  recoveryPasswordConfirm.required = true;
  confirmField.append(confirmLabel, recoveryPasswordConfirm);

  const saveRecoveryButton = document.createElement('button');
  saveRecoveryButton.className = 'btn primary auth-primary';
  saveRecoveryButton.id = 'saveRecoveryPasswordBtn';
  saveRecoveryButton.type = 'submit';
  saveRecoveryButton.textContent = 'Yeni şifreyi kaydet';

  const cancelRecoveryButton = document.createElement('button');
  cancelRecoveryButton.className = 'btn secondary';
  cancelRecoveryButton.id = 'cancelRecoveryBtn';
  cancelRecoveryButton.type = 'button';
  cancelRecoveryButton.textContent = 'Giriş ekranına dön';

  recoveryPanel.append(passwordField, confirmField, saveRecoveryButton, cancelRecoveryButton);
  authCard.insertBefore(recoveryPanel, authMessage);

  const originalTitle = authCardTitle?.textContent || 'Çalışma alanına gir';
  const originalCopy = authCardCopy?.textContent || 'Kendi mağaza verilerinizi güvenle açın.';

  function showRecoveryMode(email = '') {
    if (typeof clearSession === 'function') clearSession();
    if (typeof renderSignedOut === 'function') renderSignedOut();
    authForm.classList.add('hide');
    recoveryPanel.classList.remove('hide');
    authPanel?.classList.remove('hide');
    appPanel?.classList.add('hide');
    if (authCardTitle) authCardTitle.textContent = 'Yeni şifre belirle';
    if (authCardCopy) authCardCopy.textContent = email ? `${email} hesabı için güçlü ve benzersiz bir şifre seç.` : 'Güçlü ve benzersiz bir şifre seç.';
    setNotice(authMessage, 'Şifren en az 12 karakter olmalı; büyük/küçük harf, rakam ve sembol içermeli.');
    recoveryPassword.focus();
  }

  async function returnToLogin(message = '', kind = '') {
    await revokeRecoverySession();
    recoveryPassword.value = '';
    recoveryPasswordConfirm.value = '';
    recoveryPanel.classList.add('hide');
    authForm.classList.remove('hide');
    if (authCardTitle) authCardTitle.textContent = originalTitle;
    if (authCardCopy) authCardCopy.textContent = originalCopy;
    if (typeof clearSession === 'function') clearSession();
    if (typeof renderSignedOut === 'function') renderSignedOut();
    setNotice(authMessage, message, kind);
  }

  forgotButton.addEventListener('click', async () => {
    const emailInput = document.getElementById('authEmail');
    const email = String(emailInput?.value || '').trim().toLowerCase();
    if (!validEmail(email)) {
      setNotice(authMessage, 'Önce hesabında kullandığın geçerli e-posta adresini gir.', 'bad');
      emailInput?.focus();
      return;
    }
    setBusy(forgotButton, true, 'Bağlantı gönderiliyor…');
    setNotice(authMessage);
    try {
      const redirectTo = new URL('/uygulama', location.origin).toString();
      await authRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { body: { email } });
      setNotice(authMessage, 'Bu e-posta bir KârKalkan hesabına bağlıysa şifre yenileme bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.', 'good');
    } catch (error) {
      setNotice(authMessage, humanError(error), 'bad');
    } finally {
      setBusy(forgotButton, false);
    }
  });

  recoveryPanel.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = String(recoveryPassword.value || '');
    const confirm = String(recoveryPasswordConfirm.value || '');
    if (password !== confirm) {
      setNotice(authMessage, humanError(new Error('PASSWORD_CONFIRMATION_MISMATCH')), 'bad');
      return;
    }
    setBusy(saveRecoveryButton, true, 'Şifre güncelleniyor…');
    setNotice(authMessage);
    try {
      const token = await ensureRecoveryAccessToken();
      await authRequest('/auth/v1/user', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: { password }
      });
      await returnToLogin('Şifren güvenli şekilde güncellendi. Yeni şifrenle giriş yapabilirsin.', 'good');
    } catch (error) {
      setNotice(authMessage, humanError(error), 'bad');
    } finally {
      setBusy(saveRecoveryButton, false);
    }
  });

  cancelRecoveryButton.addEventListener('click', async () => {
    await returnToLogin();
  });

  (async function consumeRecoveryRedirect() {
    const fragment = location.hash.startsWith('#') ? new URLSearchParams(location.hash.slice(1)) : new URLSearchParams();
    const isRecovery = fragment.get('type') === 'recovery';
    if (isRecovery) {
      const accessToken = String(fragment.get('access_token') || '');
      const refreshToken = String(fragment.get('refresh_token') || '');
      const expiresIn = Number(fragment.get('expires_in') || 3600);
      const expiresAt = Number(fragment.get('expires_at')) || Math.floor(Date.now() / 1000) + expiresIn;
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      if (!accessToken || !refreshToken) {
        writeRecoverySession(null);
        setNotice(authMessage, humanError(new Error('PASSWORD_RECOVERY_INVALID')), 'bad');
        return;
      }
      try {
        const user = await coreAuthRequest('/auth/v1/user', {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        recoverySession = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          email: String(user?.email || '')
        };
        writeRecoverySession(recoverySession);
        showRecoveryMode(recoverySession.email);
        return;
      } catch {
        writeRecoverySession(null);
        setNotice(authMessage, humanError(new Error('PASSWORD_RECOVERY_INVALID')), 'bad');
        return;
      }
    }

    recoverySession = readRecoverySession();
    if (recoverySession) showRecoveryMode(recoverySession.email);
    else writeRecoverySession(null);
  })();
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
