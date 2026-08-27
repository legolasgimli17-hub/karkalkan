import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read=path=>readFile(path,'utf8');

test('local secret and provider metadata are excluded from source handoff',async()=>{
  const gitignore=await read('.gitignore');
  for(const entry of ['.env','.env.*','!.env.example','.vercel/','.supabase/','*.pem','*.key','*.p12','*.pfx']){
    assert.match(gitignore,new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
});

test('current source ownership files are transfer-neutral',async()=>{
  const [codeowners,readme,handoff]=await Promise.all([
    read('.github/CODEOWNERS'),
    read('README.md'),
    read('docs/BUYER_HANDOFF.md'),
  ]);
  const activeCodeowners=codeowners.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  assert.equal(activeCodeowners.length,0,'CODEOWNERS must not bind the sale snapshot to a seller account');
  assert.doesNotMatch(readme,/https:\/\/github\.com\/[^/\s]+\/karkalkan/i);
  assert.match(handoff,/<buyer-account-or-org>\/karkalkan/);
  assert.doesNotMatch(handoff,/GitHub repository:\s*`(?!<)[^`]+\/karkalkan`/i);
  assert.doesNotMatch(handoff,/Supabase project ref:\s*`[a-z0-9]{20}`/i);
});

test('handoff explicitly separates clean source from historical Git metadata',async()=>{
  const [transfer,checklist,readme]=await Promise.all([
    read('TRANSFER.md'),
    read('docs/SALE_TRANSFER_CHECKLIST.md'),
    read('README.md'),
  ]);
  for(const source of [transfer,checklist,readme]){
    assert.match(source,/history-free|history free/i);
    assert.match(source,/\.git/);
  }
  assert.match(transfer,/author names, email addresses|author names\/emails/i);
  assert.match(checklist,/generated Vercel preview\/deployment URLs/i);
});

test('buyer bundle builder excludes history, local provider state and real env files',async()=>{
  const source=await read('scripts/build-buyer-bundle.py');
  for(const marker of ['.git','.vercel','.supabase','node_modules','dist','.env.example','SALE_PII_DENYLIST','--check-only','karkalkan-buyer-source.zip']){
    assert.match(source,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  assert.match(source,/PRIVATE KEY/);
  assert.match(source,/GitHub token/);
  assert.match(source,/personal email provider address/);
});

test('pre-sale source privacy and secret scan passes',()=>{
  const result=spawnSync('python3',['scripts/build-buyer-bundle.py','--check-only'],{
    encoding:'utf8',
    env:{...process.env,SALE_PII_DENYLIST:''},
    maxBuffer:1024*1024,
  });
  assert.equal(result.status,0,`buyer bundle privacy scan failed\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout,/Pre-sale scan passed/);
});
