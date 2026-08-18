import postgres from 'npm:postgres@3.4.7'

export type PoolerCheck =
  | { ok: true; mode: 'shared-transaction' | 'dedicated-transaction' }
  | { ok: false; code: 'DB_URL_MISSING' | 'DB_URL_INVALID' | 'TRANSACTION_POOLER_REQUIRED' }

/**
 * Edge Functions must use a Supabase transaction pooler on port 6543.
 * Direct database URLs (db.<ref>.supabase.co:5432) are intentionally rejected
 * so a configuration mistake cannot silently exhaust Postgres connections.
 */
export function checkTransactionPoolerUrl(raw: string | undefined | null): PoolerCheck {
  const value=String(raw||'').trim()
  if(!value)return {ok:false,code:'DB_URL_MISSING'}
  try{
    const url=new URL(value)
    if(!['postgres:','postgresql:'].includes(url.protocol)||!url.username||!url.hostname)return {ok:false,code:'DB_URL_INVALID'}
    const host=url.hostname.toLowerCase()
    const shared=/(^|\.)pooler\.supabase\.com$/.test(host)
    const dedicated=/^db\.[a-z0-9]+\.supabase\.co$/.test(host)
    if(url.port!=='6543'||(!shared&&!dedicated))return {ok:false,code:'TRANSACTION_POOLER_REQUIRED'}
    return {ok:true,mode:shared?'shared-transaction':'dedicated-transaction'}
  }catch{return {ok:false,code:'DB_URL_INVALID'}}
}

export function createTransactionPool(raw: string | undefined | null, options: Record<string,unknown>={}) {
  const check=checkTransactionPoolerUrl(raw)
  if(!check.ok){
    console.error(`[db-config] ${check.code}`)
    return null
  }
  return postgres(String(raw),{
    idle_timeout:5,
    max_lifetime:120,
    ...options,
    // Supabase transaction pooling does not support prepared statements.
    prepare:false,
    // Each Edge isolate keeps at most one client connection to the pooler.
    max:1
  })
}
