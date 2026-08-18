import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root=process.cwd();
const read=(path)=>readFile(join(root,path),'utf8');

test('password recovery request is enumeration-safe and returns to the canonical app route',async()=>{
  const source=await read('v4-security.js');
  assert.match(source,/\/auth\/v1\/recover\?redirect_to=/);
  assert.match(source,/new URL\('\/uygulama', location\.origin\)/);
  assert.match(source,/Bu e-posta bir KârKalkan hesabına bağlıysa/);
  assert.doesNotMatch(source,/hesap bulunamadı|kullanıcı bulunamadı|email kayıtlı değil/i);
});

test('recovery tokens are isolated from the normal app session and removed from the URL',async()=>{
  const source=await read('v4-security.js');
  assert.match(source,/RECOVERY_KEY = 'karkalkan\.v4\.recovery'/);
  assert.match(source,/fragment\.get\('type'\) === 'recovery'/);
  assert.match(source,/history\.replaceState\(null, '', `\$\{location\.pathname\}\$\{location\.search\}`\)/);
  assert.match(source,/coreAuthRequest\('\/auth\/v1\/user',[\s\S]*method: 'GET'/);
  assert.match(source,/sessionStorage\.setItem\(RECOVERY_KEY/);
  assert.doesNotMatch(source,/localStorage\.setItem\(RECOVERY_KEY/);
});

test('password update uses the authenticated user endpoint and the same strength and breach guard as signup',async()=>{
  const source=await read('v4-security.js');
  assert.match(source,/isPasswordUpdate = normalizedPath\.startsWith\('\/auth\/v1\/user'\) && method === 'PUT'/);
  assert.match(source,/if \(\(isSignup \|\| isPasswordUpdate\) && password\)/);
  assert.match(source,/PASSWORD_TOO_WEAK/);
  assert.match(source,/PASSWORD_COMPROMISED/);
  assert.match(source,/await authRequest\('\/auth\/v1\/user',[\s\S]*method: 'PUT'[\s\S]*body: \{ password \}/);
  assert.match(source,/await revokeRecoverySession\(\)/);
});
