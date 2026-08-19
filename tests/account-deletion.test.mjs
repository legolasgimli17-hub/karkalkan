import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('account deletion endpoint is self-only and requires destructive confirmation',async()=>{
  const source=await read('supabase/functions/account-delete/index.ts');
  assert.match(source,/authenticate\(req\)/);
  assert.match(source,/CONFIRMATION='HESABIMI SİL'/);
  assert.match(source,/email!==currentEmail/);
  assert.match(source,/deleteUser\(auth\.user\.id,false\)/);
  assert.doesNotMatch(source,/body\?\.user_id|body\.user_id/);
  assert.doesNotMatch(source,/SUPABASE_SECRET_KEYS/);
});

test('account deletion blocks subscriptions that can still bill or require resolution',async()=>{
  const source=await read('supabase/functions/account-delete/index.ts');
  for(const status of ['trialing','active','past_due','paused'])assert.match(source,new RegExp(status));
  assert.match(source,/ACCOUNT_DELETE_ACTIVE_SUBSCRIPTION/);
  assert.match(source,/billing_subscriptions/);
});

test('account deletion fails safely for storage blockers and unexpected errors',async()=>{
  const source=await read('supabase/functions/account-delete/index.ts');
  assert.match(source,/ACCOUNT_DELETE_STORAGE_BLOCKED/);
  assert.match(source,/captureSafeFailure\('account-delete','ACCOUNT_DELETE_FAILED'/);
  assert.match(source,/ACCOUNT_DELETE_FAILED/);
});

test('account management page is noindex and uses only publishable browser credentials',async()=>{
  for(const path of ['hesap.html','hesap.js','hesap.css'])await access(path);
  const html=await read('hesap.html');
  const js=await read('hesap.js');
  assert.match(html,/noindex,nofollow/);
  assert.match(html,/HESABIMI SİL/);
  assert.match(js,/karkalkan\.v4\.session/);
  assert.match(js,/functions\/v1\/account-delete/);
  assert.match(js,/Authorization:`Bearer \$\{token\}`/);
  assert.doesNotMatch(js,/service_role|SUPABASE_SECRET_KEYS|secret[_-]?key/i);
  assert.doesNotMatch(js,/user_id/);
});

test('client requires current account email and exact confirmation before enabling delete',async()=>{
  const source=await read('hesap.js');
  assert.match(source,/email===String\(session\.user\.email\)/);
  assert.match(source,/confirmation===CONFIRMATION/);
  assert.match(source,/deleteButton\.disabled=!validConfirmation\(\)/);
  assert.match(source,/key\.startsWith\('karkalkan\.'\)/);
});
