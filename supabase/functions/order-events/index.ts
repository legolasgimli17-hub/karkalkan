import { createTransactionPool } from '../_shared/postgres.ts'
import { captureMonitoringException } from '../_shared/observability.ts'
import { consumeRateLimit, isUuid, readJsonBody, requestError } from '../_shared/request-security.ts'

const DB_URL=Deno.env.get('KARKALKAN_DB_POOLER_URL')||''
const sql=createTransactionPool(DB_URL)
const MAX_BODY_BYTES=2_000_000
const MAX_PACKAGES=100
const MAX_LINES_PER_PACKAGE=250
const MAX_MONEY=1_000_000_000
const MAX_QUANTITY=1_000_000
const MAX_EVENT_AGE_MS=2*365*24*60*60*1000
const MAX_EVENT_FUTURE_MS=24*60*60*1000

function json(status:number,body:unknown,extra:Record<string,string>={}){
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra}})
}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function timingSafeEqualSha256(left:unknown,right:unknown){const a=String(left??'').toLowerCase(),b=String(right??'').toLowerCase();if(!/^[0-9a-f]{64}$/.test(a)||!/^[0-9a-f]{64}$/.test(b))return false;let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
function clean(value:unknown,max:number){const text=String(value??'').trim();return text?text.slice(0,max):''}
function amount(value:unknown){const number=Number(value);return Number.isFinite(number)&&Math.abs(number)<=MAX_MONEY?Math.round(number*100)/100:null}
function eventTime(value:unknown){
  const numeric=Number(value)
  const parsed=Number.isFinite(numeric)&&numeric>0?new Date(numeric):new Date(String(value??''))
  const time=parsed.getTime(),now=Date.now()
  return Number.isFinite(time)&&time>=now-MAX_EVENT_AGE_MS&&time<=now+MAX_EVENT_FUTURE_MS?parsed.toISOString():null
}
function safeLines(lines:unknown){
  if(!Array.isArray(lines))return[]
  return lines.slice(0,MAX_LINES_PER_PACKAGE).map((line:any)=>({
    barcode:clean(line?.barcode,180)||null,
    sku:clean(line?.merchantSku??line?.stockCode,180)||null,
    quantity:Math.min(MAX_QUANTITY,Math.max(0,Math.trunc(Number(line?.quantity)||0))),
    unitPrice:amount(line?.lineUnitPrice??line?.price),
    productName:clean(line?.productName,220)||null
  }))
}

Deno.serve(async(req:Request)=>{try{
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},{Allow:'POST'})
  if(!sql)return json(503,{error:'SERVER_CONFIG'})
  const requestUrl=new URL(req.url),connectionId=requestUrl.searchParams.get('c')||''
  if(!isUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'})
  const supplied=req.headers.get('x-api-key')||''
  if(supplied.length<32||supplied.length>256)return json(401,{error:'UNAUTHORIZED'})
  const suppliedHash=await sha256(supplied)
  const hooks=await sql`select user_id,secret_hash,status from public.marketplace_webhooks where connection_id=${connectionId}::uuid limit 1`
  const hook=hooks[0]
  if(!hook||hook.status!=='active'||!timingSafeEqualSha256(hook.secret_hash,suppliedHash))return json(401,{error:'UNAUTHORIZED'})
  if(!await consumeRateLimit(sql,'order-events',connectionId,600,60))return json(429,{error:'RATE_LIMITED'},{'Retry-After':'60'})

  let body:unknown
  try{body=await readJsonBody(req,MAX_BODY_BYTES)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code})}
  const packages=Array.isArray((body as any)?.content)?(body as any).content:Array.isArray(body)?body:[body]
  if(packages.length>MAX_PACKAGES)return json(413,{error:'TOO_MANY_EVENTS',max:MAX_PACKAGES})

  const normalized=[] as Array<{packageId:string;status:string;orderNumber:string|null;eventAt:string;lines:unknown[];total:number|null;fingerprint:string}>
  let skipped=0
  for(const entry of packages){
    const packageId=clean(entry?.id??entry?.shipmentPackageId??entry?.packageId,120)
    const status=clean(entry?.status,80)
    const eventAt=eventTime(entry?.packageLastModifiedDate??entry?.lastModifiedDate??entry?.orderDate)
    if(!packageId||!status||!eventAt){skipped++;continue}
    const orderNumber=clean(entry?.orderNumber,120)||null
    const lines=safeLines(entry?.lines)
    const total=amount(entry?.totalPrice??entry?.grossAmount??entry?.totalAmount)
    const fingerprint=await sha256(`${connectionId}|${packageId}|${status}|${eventAt}`)
    normalized.push({packageId,status,orderNumber,eventAt,lines,total,fingerprint})
  }

  let accepted=0,duplicates=0
  await sql.begin(async tx=>{
    for(const item of normalized){
      const inserted=await tx`insert into public.marketplace_order_events(connection_id,user_id,event_fingerprint,package_id,order_number,status,event_at,total_amount,line_count,line_summary) values(${connectionId}::uuid,${hook.user_id}::uuid,${item.fingerprint},${item.packageId},${item.orderNumber},${item.status},${item.eventAt}::timestamptz,${item.total},${item.lines.length},${JSON.stringify(item.lines)}::jsonb) on conflict (event_fingerprint) do nothing returning id`
      if(!inserted.length){duplicates++;continue}
      await tx`insert into public.marketplace_live_orders(connection_id,user_id,package_id,order_number,status,event_at,total_amount,line_count,updated_at) values(${connectionId}::uuid,${hook.user_id}::uuid,${item.packageId},${item.orderNumber},${item.status},${item.eventAt}::timestamptz,${item.total},${item.lines.length},now()) on conflict (connection_id,package_id) do update set order_number=excluded.order_number,status=excluded.status,event_at=excluded.event_at,total_amount=excluded.total_amount,line_count=excluded.line_count,updated_at=now() where excluded.event_at>=public.marketplace_live_orders.event_at`
      accepted++
    }
  })
  return json(200,{ok:true,accepted,duplicates,skipped})
}catch(error){
  console.error('order-events failed: INTERNAL_ERROR')
  await captureMonitoringException(error,{functionName:'order-events',code:'INTERNAL_ERROR'})
  return json(500,{error:'INTERNAL_ERROR'})
}})
