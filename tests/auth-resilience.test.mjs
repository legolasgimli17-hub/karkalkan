import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../v4.js', import.meta.url), 'utf8');

// Exercise production function bodies without a browser or live customer data.
function functionSource(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(source);
  assert.ok(match, `missing function: ${name}`);
  const start = match.index;
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function: ${name}`);
}

function sandbox(sourceText, dependencies = {}) {
  const context = vm.createContext(dependencies);
  vm.runInContext(sourceText, context);
  return context.api;
}

function storage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key)
  };
}

test('remember-session persists to local storage and sign-out clears both stores', () => {
  const persistent = storage();
  const temporary = storage();
  const api = sandbox(`
    const SESSION_KEY = 'karkalkan.v4.session';
    const ACTIVE_CONNECTION_KEY = 'karkalkan.v4.activeConnection';
    const els = { rememberSession: { checked: true } };
    let session = null;
    let connections = [];
    let activeConnectionId = '';
    ${functionSource('saveSession')}
    ${functionSource('parseStoredSession')}
    ${functionSource('clearSession')}
    globalThis.api = { saveSession, parseStoredSession, clearSession };
  `, { localStorage: persistent, sessionStorage: temporary });
  const input = {
    access_token: 'access', refresh_token: 'refresh', expires_in: 3600,
    user: { id: 'test-user', email: 'test@example.com' }
  };
  api.saveSession(input);
  assert.equal(api.parseStoredSession().user.id, 'test-user');
  assert.ok(persistent.getItem('karkalkan.v4.session'));
  assert.equal(temporary.getItem('karkalkan.v4.session'), null);
  api.clearSession();
  assert.equal(persistent.getItem('karkalkan.v4.session'), null);
  assert.equal(temporary.getItem('karkalkan.v4.session'), null);
});

test('temporary refresh outage does not log out a valid account', async () => {
  const api = sandbox(`
    let session = { refresh_token: 'refresh', user: { email: 'test@example.com' } };
    let refreshPromise = null;
    let clearCount = 0;
    let signedOutCount = 0;
    let failureStatus = 503;
    async function authRequest() { const error = new Error('temporary outage'); error.status = failureStatus; throw error; }
    function clearSession() { clearCount += 1; session = null; }
    function renderSignedOut() { signedOutCount += 1; }
    function saveSession(data) { session = data; }
    ${functionSource('refreshSession')}
    globalThis.api = { refreshSession, counters: () => ({ clearCount, signedOutCount }), setStatus: (status) => { failureStatus = status; } };
  `);
  await assert.rejects(api.refreshSession(), /temporary outage/);
  assert.equal(api.counters().clearCount, 0);
  assert.equal(api.counters().signedOutCount, 0);
  api.setStatus(401);
  await assert.rejects(api.refreshSession(), /temporary outage/);
  assert.equal(api.counters().clearCount, 1);
  assert.equal(api.counters().signedOutCount, 1);
});

test('workspace fetch failure shows a warning without discarding a valid session', async () => {
  const api = sandbox(`
    let session = { access_token: 'valid', user: { email: 'test@example.com' } };
    const els = { workspaceNotice: { classList: { add() {} } } };
    let warned = false;
    async function loadConnections() { throw new Error('backend unavailable'); }
    function showWorkspaceWarning(error) { warned = error.message === 'backend unavailable'; }
    function renderSignedOut() { throw new Error('must not sign out'); }
    function setNotice() { throw new Error('must not show login error'); }
    function humanError(error) { return error.message; }
    ${functionSource('loadWorkspace')}
    globalThis.api = { loadWorkspace, inspect: () => ({ warned, signedIn: !!session }) };
  `);
  assert.equal(await api.loadWorkspace(), false);
  assert.equal(api.inspect().warned, true);
  assert.equal(api.inspect().signedIn, true);
});
