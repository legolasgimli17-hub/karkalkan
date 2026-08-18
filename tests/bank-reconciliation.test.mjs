import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPayoutCandidates, detectMarketplaceHint, maskBankDescription, minimizeBankDescription } from '../supabase/functions/_shared/bank-reconciliation.js';

const root=process.cwd();
const read=(path)=>readFile(join(root,path),'utf8');

test('bank descriptions are minimized before persistence',()=>{
  const raw='TRENDYOL ödeme TR330006100519786457841326 mail test@example.com tel 05321234567 ref 987654321';
  const masked=maskBankDescription(raw);
  assert.match(masked,/TRENDYOL/);
  assert.match(masked,/\[IBAN\]/);
  assert.match(masked,/\[e-posta\]/);
  assert.match(masked,/\[telefon\]/);
  assert.match(masked,/••••4321/);
  for(const secret of ['TR330006100519786457841326','test@example.com','05321234567','987654321'])assert.doesNotMatch(masked,new RegExp(secret));
  assert.ok(masked.length<=240);
});

test('marketplace hints use explicit payment descriptors',()=>{
  assert.equal(detectMarketplaceHint('DSM GRUP HAKEDIS'), 'trendyol');
  assert.equal(detectMarketplaceHint('Hepsiburada satıcı ödemesi'), 'hepsiburada');
  assert.equal(detectMarketplaceHint('N11 ödeme'), 'n11');
  assert.equal(detectMarketplaceHint('normal havale'), null);
});

test('persisted bank descriptions retain only the channel signal',()=>{
  const minimized=minimizeBankDescription('TRENDYOL ödeme gönderen Ahmet Yılmaz test@example.com TR330006100519786457841326');
  assert.deepEqual(minimized,{providerHint:'trendyol',descriptionMasked:'Trendyol işareti · banka açıklaması gizlendi.'});
  assert.doesNotMatch(minimized.descriptionMasked,/Ahmet|Yılmaz|example|TR33/);
  assert.deepEqual(minimizeBankDescription('Ahmet Yılmaz kira ödemesi'),{providerHint:null,descriptionMasked:'Banka açıklaması gizlendi.'});
});

test('payout candidates are bounded, provider-aware and never auto-confirmed',()=>{
  const connection={id:'11111111-1111-4111-8111-111111111111',marketplace:'trendyol',display_name:'Ana mağaza'};
  const rows=Array.from({length:7},(_,index)=>({
    connection_id:connection.id,
    day:`2026-08-${String(index+1).padStart(2,'0')}`,
    currency:'TRY',
    seller_revenue:100,
    settlement_adjustment_net:0,
    platform_service_fee_cost:0,
    cargo_cost:0,
    stoppage_net:0
  }));
  const candidates=buildPayoutCandidates({amount:700,currency:'TRY',transaction_date:'2026-08-08',provider_hint:'trendyol'},[connection],rows);
  assert.ok(candidates.length>=1&&candidates.length<=3);
  assert.deepEqual(candidates[0],{
    connectionId:connection.id,marketplace:'trendyol',displayName:'Ana mağaza',rangeStart:'2026-08-01',rangeEnd:'2026-08-07',expectedAmount:700,bankAmount:700,differenceAmount:0,confidence:'strong',providerMatched:true,evidenceBasis:'known_cash_window_v1'
  });
  assert.equal('status' in candidates[0],false);
  assert.deepEqual(buildPayoutCandidates({amount:700,currency:'TRY',transaction_date:'2026-08-08',provider_hint:'amazon'},[connection],rows),[]);
});

test('bank reconciliation storage is owner-isolated, read-only to browsers and privacy-minimal',async()=>{
  const migration=await read('supabase/migrations/20260819013000_bank_statement_reconciliation.sql');
  for(const table of ['bank_statement_imports','bank_transactions','bank_reconciliation_reviews']){
    assert.match(migration,new RegExp(`create table public\\.${table}`,'i'));
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`,'i'));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`,'i'));
    assert.match(migration,new RegExp(`grant select on table public\\.${table} to authenticated`,'i'));
    assert.match(migration,new RegExp(`${table}_select_own`,'i'));
  }
  assert.match(migration,/using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration,/reference_sha256/);
  assert.doesNotMatch(migration,/\biban\b\s+(text|varchar)|account_number|raw_reference|raw_file/i);
});

test('bank endpoint is bounded, rate-limited and server-authoritative',async()=>{
  const source=await read('supabase/functions/bank-reconciliation/index.ts');
  const config=await read('supabase/config.toml');
  assert.match(source,/MAX_ROWS=5000/);
  assert.match(source,/MAX_LIST_ROWS=500/);
  assert.match(source,/readJsonBody\(req,3_000_000\)/);
  assert.match(source,/consumeRateLimit/);
  assert.match(source,/user_id=\$\{userId\}/);
  assert.match(source,/RECONCILIATION_CANDIDATE_CHANGED/);
  assert.match(source,/buildPayoutCandidates/);
  assert.match(source,/captureSafeFailure\('bank-reconciliation'/);
  assert.doesNotMatch(source,/SUPABASE_DB_URL|service_role/i);
  assert.match(config,/\[functions\.bank-reconciliation\][\s\S]*?verify_jwt = true/);
});
