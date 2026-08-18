import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { buildPayoutCandidates, minimizeBankDescription } from '../_shared/bank-reconciliation.js'
import { captureSafeFailure } from '../_shared/observability.ts'
import { createTransactionPool } from '../_shared/postgres.ts'
import { consumeRateLimit, isUuid, readJsonBody, requestError } from '../_shared/request-security.ts'

type BankRow={
  id:string
  import_id:string
  transaction_date:string
  value_date:string|null
  amount:number|string
  currency:string
  description_masked:string
  provider_hint:string|null
}
type ConnectionRow={id:string;marketplace:string;display_name:string;currency?:string}
type FinanceRow={
  connection_id:string
  day:string
  currency:string
  seller_revenue:number|string
  settlement_adjustment_net:number|string
  platform_service_fee_cost:number|string
  cargo_cost:number|string
  stoppage_net:number|string
}
type ReviewRow={
  id:string
  bank_transaction_id:string
  connection_id:string
  range_start:string
  range_end:string
  expected_amount:number|string
  bank_amount:number|string
  difference_amount:number|string
  confidence:string
  status:string
  reviewed_at:string
}
type Candidate={
  connectionId:string
  marketplace:string
  displayName:string
  rangeStart:string
  rangeEnd:string
  expectedAmount:number
  bankAmount:number
  differenceAmount:number
  confidence:'strong'|'medium'|'weak'
  providerMatched:boolean
  evidenceBasis:'known_cash_window_v1'
}

const sql:any=createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL')||'',{max_lifetime:60})
const MAX_ROWS=5000
const MAX_LIST_ROWS=500
const DAY_MS=86_400_000
const encoder=new TextEncoder()

function cleanText(value:unknown,max:number){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max)}
function validDate(value:unknown){
  const text=String(value??'').trim()
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return ''
  const [year,month,day]=text.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day))
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?text:''
}
function dateShift(value:string,days:number){return new Date(Date.parse(`${value}T00:00:00Z`)+days*DAY_MS).toISOString().slice(0,10)}
function money(value:unknown){const number=Number(value);return Number.isFinite(number)?Math.round(number*100)/100:NaN}
function currency(value:unknown){const result=String(value??'').trim().toUpperCase();return /^[A-Z]{3}$/.test(result)?result:''}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',encoder.encode(value));return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}

function candidateKey(transactionId:string,connectionId:string,start:string,end:string){return`${transactionId}:${connectionId}:${start}:${end}`}

async function loadCandidateContext(userId:string,startDate:string,endDate:string,transactionId?:string){
  const transactions=transactionId
    ?await sql<BankRow[]>`select id,import_id,transaction_date::text,value_date::text,amount,currency,description_masked,provider_hint from public.bank_transactions where id=${transactionId}::uuid and user_id=${userId}::uuid and amount>0`
    :await sql<BankRow[]>`select id,import_id,transaction_date::text,value_date::text,amount,currency,description_masked,provider_hint from public.bank_transactions where user_id=${userId}::uuid and transaction_date between ${startDate}::date and ${endDate}::date and amount>0 order by transaction_date desc,created_at desc limit ${MAX_LIST_ROWS+1}`
  if(transactions.length>MAX_LIST_ROWS)throw new Error('BANK_LEDGER_TOO_LARGE')
  const connections=await sql<ConnectionRow[]>`select id,marketplace,display_name from public.marketplace_connections where user_id=${userId}::uuid order by created_at`
  const financeStart=dateShift(startDate,-38)
  const financialRows=connections.length?await sql<FinanceRow[]>`
    with owned_connections as (select value::uuid as id from jsonb_array_elements_text(${JSON.stringify(connections.map(item=>item.id))}::jsonb))
    select f.connection_id,f.day::text,f.currency,f.seller_revenue,f.settlement_adjustment_net,f.platform_service_fee_cost,f.cargo_cost,f.stoppage_net
    from public.marketplace_daily_financials f
    join owned_connections c on c.id=f.connection_id
    where f.user_id=${userId}::uuid and f.day between ${financeStart}::date and ${endDate}::date
    order by f.connection_id,f.day
  `:[]
  return{transactions,connections,financialRows}
}

async function handleGet(userId:string,url:URL,origin:string|null){
  const days=Math.trunc(Math.min(365,Math.max(7,Number(url.searchParams.get('days')||90)||90)))
  const endDate=new Date().toISOString().slice(0,10),startDate=dateShift(endDate,-days+1)
  const {transactions,connections,financialRows}=await loadCandidateContext(userId,startDate,endDate)
  const ids=transactions.map(item=>item.id)
  const reviews=ids.length?await sql<ReviewRow[]>`
    with selected_transactions as (select value::uuid as id from jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))
    select r.id,r.bank_transaction_id,r.connection_id,r.range_start::text,r.range_end::text,r.expected_amount,r.bank_amount,r.difference_amount,r.confidence,r.status,r.reviewed_at
    from public.bank_reconciliation_reviews r join selected_transactions t on t.id=r.bank_transaction_id
    where r.user_id=${userId}::uuid order by r.reviewed_at desc
  `:[]
  const reviewMap=new Map(reviews.map(review=>[candidateKey(review.bank_transaction_id,review.connection_id,review.range_start,review.range_end),review]))
  const [imports,importStats]=await Promise.all([
    sql`select id,account_label,account_last4,currency,period_start::text,period_end::text,row_count,created_at from public.bank_statement_imports where user_id=${userId}::uuid order by created_at desc limit 20`,
    sql`select count(*)::integer as imports,coalesce(sum(row_count),0)::bigint as transactions from public.bank_statement_imports where user_id=${userId}::uuid`
  ])
  let candidateCount=0,confirmedCount=0,rejectedCount=0,unmatchedCount=0
  const result=transactions.map(transaction=>{
    const candidates=(buildPayoutCandidates(transaction,connections,financialRows) as Candidate[]).map(candidate=>{
      const review=reviewMap.get(candidateKey(transaction.id,candidate.connectionId,candidate.rangeStart,candidate.rangeEnd))
      if(review?.status==='confirmed')confirmedCount++
      else if(review?.status==='rejected')rejectedCount++
      else candidateCount++
      return{...candidate,review:review?{id:review.id,status:review.status,reviewedAt:review.reviewed_at}:null}
    })
    if(!candidates.length)unmatchedCount++
    return{id:transaction.id,importId:transaction.import_id,transactionDate:transaction.transaction_date,valueDate:transaction.value_date,amount:money(transaction.amount),currency:transaction.currency,description:transaction.description_masked,providerHint:transaction.provider_hint,candidates}
  })
  return json(200,{period:{start:startDate,end:endDate,days},summary:{imports:Number(importStats[0]?.imports||0),transactions:Number(importStats[0]?.transactions||0),credits:transactions.length,candidates:candidateCount,confirmed:confirmedCount,rejected:rejectedCount,unmatched:unmatchedCount},imports,transactions:result,disclaimer:'Adaylar banka dekontu veya muhasebe kaydı değildir; yalnızca tutar, tarih aralığı ve kanal açıklaması kanıtlarıyla inceleme sırası üretir.'},origin)
}

async function handleImport(userId:string,body:any,origin:string|null){
  const accountLabel=cleanText(body?.account_label,80),accountLast4=cleanText(body?.account_last4,4),importCurrency=currency(body?.currency),sourceRows=Array.isArray(body?.rows)?body.rows:[]
  if(!accountLabel||!importCurrency||accountLast4&&!/^[A-Za-z0-9]{2,4}$/.test(accountLast4))return json(400,{error:'INVALID_BANK_ACCOUNT_LABEL'},origin)
  if(!sourceRows.length||sourceRows.length>MAX_ROWS)return json(400,{error:'INVALID_BANK_IMPORT_SIZE',maxRows:MAX_ROWS},origin)
  const today=new Date().toISOString().slice(0,10),maxDate=dateShift(today,1),rows=[]
  for(let index=0;index<sourceRows.length;index++){
    const source=sourceRows[index]||{},transactionDate=validDate(source.transaction_date),valueDate=source.value_date?validDate(source.value_date):'',amount=money(source.amount),rowCurrency=currency(source.currency||importCurrency),rawDescription=cleanText(source.description,1000),rawReference=cleanText(source.reference,500)
    if(!transactionDate||transactionDate<'2000-01-01'||transactionDate>maxDate||source.value_date&&!valueDate||!Number.isFinite(amount)||amount===0||Math.abs(amount)>1_000_000_000_000||rowCurrency!==importCurrency)return json(400,{error:'INVALID_BANK_IMPORT_ROW',row:index+2},origin)
    const minimized=minimizeBankDescription(rawDescription),referenceSha256=rawReference?await sha256(rawReference):null
    rows.push({row_number:index+1,transaction_date:transactionDate,value_date:valueDate||null,amount,currency:rowCurrency,description_masked:minimized.descriptionMasked,reference_sha256:referenceSha256,provider_hint:minimized.providerHint})
  }
  const dates=rows.map(row=>row.transaction_date).sort(),periodStart=dates[0],periodEnd=dates.at(-1) as string
  if(Date.parse(`${periodEnd}T00:00:00Z`)-Date.parse(`${periodStart}T00:00:00Z`)>370*DAY_MS)return json(400,{error:'BANK_IMPORT_PERIOD_TOO_LARGE'},origin)
  if(!await consumeRateLimit(sql,'bank-reconciliation-import',userId,5,3600))return json(429,{error:'RATE_LIMITED'},origin)
  const fileSha256=await sha256(JSON.stringify({accountLabel,accountLast4:accountLast4||null,currency:importCurrency,rows})),importId=crypto.randomUUID()
  try{
    await sql.begin(async tx=>{
      await tx`insert into public.bank_statement_imports(id,user_id,account_label,account_last4,currency,period_start,period_end,row_count,file_sha256) values(${importId}::uuid,${userId}::uuid,${accountLabel},${accountLast4||null},${importCurrency},${periodStart}::date,${periodEnd}::date,${rows.length},${fileSha256})`
      await tx`
        insert into public.bank_transactions(import_id,user_id,row_number,transaction_date,value_date,amount,currency,description_masked,reference_sha256,provider_hint)
        select ${importId}::uuid,${userId}::uuid,x.row_number,x.transaction_date,x.value_date,x.amount,x.currency,x.description_masked,x.reference_sha256,x.provider_hint
        from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as x(row_number integer,transaction_date date,value_date date,amount numeric,currency text,description_masked text,reference_sha256 text,provider_hint text)
      `
    })
    return json(200,{ok:true,importId,rows:rows.length,periodStart,periodEnd,privacy:{rawFileStored:false,rawReferenceStored:false,fullAccountStored:false}},origin)
  }catch(error){
    if((error as any)?.code==='23505')return json(409,{error:'DUPLICATE_BANK_IMPORT'},origin)
    await captureSafeFailure('bank-reconciliation','BANK_IMPORT_FAILED',error)
    return json(500,{error:'BANK_IMPORT_FAILED'},origin)
  }
}

async function handleReview(userId:string,body:any,origin:string|null){
  const transactionId=String(body?.bank_transaction_id||''),connectionId=String(body?.connection_id||''),rangeStart=validDate(body?.range_start),rangeEnd=validDate(body?.range_end),status=String(body?.status||'')
  if(!isUuid(transactionId)||!isUuid(connectionId)||!rangeStart||!rangeEnd||rangeEnd<rangeStart||!['confirmed','rejected'].includes(status))return json(400,{error:'INVALID_RECONCILIATION_REVIEW'},origin)
  if(!await consumeRateLimit(sql,'bank-reconciliation-review',userId,120,3600))return json(429,{error:'RATE_LIMITED'},origin)
  const context=await loadCandidateContext(userId,dateShift(rangeStart,-1),dateShift(rangeEnd,8),transactionId),transaction=context.transactions[0]
  if(!transaction)return json(404,{error:'BANK_TRANSACTION_NOT_FOUND'},origin)
  const candidate=(buildPayoutCandidates(transaction,context.connections,context.financialRows) as Candidate[]).find(item=>item.connectionId===connectionId&&item.rangeStart===rangeStart&&item.rangeEnd===rangeEnd)
  if(!candidate)return json(409,{error:'RECONCILIATION_CANDIDATE_CHANGED'},origin)
  const rows=await sql`
    insert into public.bank_reconciliation_reviews(user_id,bank_transaction_id,connection_id,range_start,range_end,expected_amount,bank_amount,difference_amount,confidence,status,reviewed_at)
    values(${userId}::uuid,${transactionId}::uuid,${connectionId}::uuid,${rangeStart}::date,${rangeEnd}::date,${candidate.expectedAmount},${candidate.bankAmount},${candidate.differenceAmount},${candidate.confidence},${status},now())
    on conflict(bank_transaction_id,connection_id,range_start,range_end)
    do update set expected_amount=excluded.expected_amount,bank_amount=excluded.bank_amount,difference_amount=excluded.difference_amount,confidence=excluded.confidence,status=excluded.status,reviewed_at=now()
    where public.bank_reconciliation_reviews.user_id=${userId}::uuid
    returning id,status,reviewed_at
  `
  if(!rows.length)return json(404,{error:'NOT_FOUND'},origin)
  return json(200,{ok:true,review:rows[0]},origin)
}

async function handleDeleteImport(userId:string,body:any,origin:string|null){
  const importId=String(body?.import_id||'')
  if(!isUuid(importId))return json(400,{error:'INVALID_BANK_IMPORT'},origin)
  if(!await consumeRateLimit(sql,'bank-reconciliation-delete',userId,20,3600))return json(429,{error:'RATE_LIMITED'},origin)
  const rows=await sql`delete from public.bank_statement_imports where id=${importId}::uuid and user_id=${userId}::uuid returning id`
  if(!rows.length)return json(404,{error:'NOT_FOUND'},origin)
  return json(200,{ok:true,deleted:importId},origin)
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(!['GET','POST'].includes(req.method))return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  if(!sql)return json(503,{error:'SERVER_CONFIG'},origin)
  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)
  try{
    if(req.method==='GET'){
      if(!await consumeRateLimit(sql,'bank-reconciliation-read',auth.user.id,240,3600))return json(429,{error:'RATE_LIMITED'},origin)
      return await handleGet(auth.user.id,new URL(req.url),origin)
    }
    let body:any
    try{body=await readJsonBody(req,3_000_000)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}
    const action=String(body?.action||'import')
    if(action==='import')return await handleImport(auth.user.id,body,origin)
    if(action==='review')return await handleReview(auth.user.id,body,origin)
    if(action==='delete_import')return await handleDeleteImport(auth.user.id,body,origin)
    return json(400,{error:'INVALID_ACTION'},origin)
  }catch(error){
    if(String((error as Error)?.message)==='BANK_LEDGER_TOO_LARGE')return json(409,{error:'BANK_LEDGER_TOO_LARGE',maxRows:MAX_LIST_ROWS},origin)
    await captureSafeFailure('bank-reconciliation','BANK_RECONCILIATION_FAILED',error)
    return json(500,{error:'BANK_RECONCILIATION_FAILED'},origin)
  }
})
