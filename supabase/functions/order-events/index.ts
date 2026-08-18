import { createTransactionPool } from '../_shared/postgres.ts'
import { captureMonitoringException } from '../_shared/observability.ts'

const DB_URL=Deno.env.get('KARKALKAN_DB_POOLER_URL')||''
const sql=createTransactionPool(DB_URL)

function json(s:number,b:unknown){return new Response(JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'}})}
function validUuid(v:string){return /^[0-9a-f-]{36}$/i.test(v)}
async function sha256(v:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function timingSafeEqualSha256(left:unknown,right:unknown){const a=String(left??'').toLowerCase(),b=String(right??'').toLowerCase();if(!/^[0-9a-f]{64}$/.test(a)||!/^[0-9a-f]{64}$/.test(b))return false;let diff=0;for(let i=0;i<64;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}
function clean(v:unknown,max:number){const s=String(v??'').trim();return s?s.slice(0,max):''}
function n(v:unknown){const x=Number(v);return Number.isFinite(x)?x:null}
function iso(v:unknown){const num=Number(v);if(Number.isFinite(num)&&num>0){const d=new Date(num);if(!Number.isNaN(d.getTime()))return d.toISOString()}const s=String(v??'');const d=new Date(s);return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString()}
function safeLines(lines:unknown){if(!Array.isArray(lines))return[];return lines.slice(0,250).map((line:any)=>({barcode:clean(line?.barcode,180)||null,sku:clean(line?.merchantSku??line?.stockCode,180)||null,quantity:Math.max(0,Math.trunc(Number(line?.quantity)||0)),unitPrice:n(line?.lineUnitPrice??line?.price),productName:clean(line?.productName,220)||null}))}

Deno.serve(async(req:Request)=>{try{
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'})
  if(!sql)return json(503,{error:'SERVER_CONFIG'})
  const u=new URL(req.url),connectionId=u.searchParams.get('c')||'';if(!validUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'})
  const supplied=req.headers.get('x-api-key')||'';if(supplied.length<32||supplied.length>256)return json(401,{error:'UNAUTHORIZED'})
  const suppliedHash=await sha256(supplied)
  const hooks=await sql`select user_id,secret_hash,status from public.marketplace_webhooks where connection_id=${connectionId}::uuid limit 1`;const hook=hooks[0];if(!hook||hook.status!=='active'||!timingSafeEqualSha256(hook.secret_hash,suppliedHash))return json(401,{error:'UNAUTHORIZED'})
  let body:any;try{body=await req.json()}catch{return json(400,{error:'INVALID_JSON'})}
  const packages=Array.isArray(body?.content)?body.content:Array.isArray(body)?body:[body]
  let accepted=0,duplicates=0,skipped=0
  for(const p of packages.slice(0,100)){
    const packageId=clean(p?.id??p?.shipmentPackageId??p?.packageId,120),status=clean(p?.status,80);if(!packageId||!status){skipped++;continue}
    const orderNumber=clean(p?.orderNumber,120)||null,eventAt=iso(p?.packageLastModifiedDate??p?.lastModifiedDate??p?.orderDate??Date.now()),lines=safeLines(p?.lines),total=n(p?.totalPrice??p?.grossAmount??p?.totalAmount)
    const fingerprint=await sha256(`${connectionId}|${packageId}|${status}|${eventAt}`)
    const inserted=await sql`insert into public.marketplace_order_events(connection_id,user_id,event_fingerprint,package_id,order_number,status,event_at,total_amount,line_count,line_summary) values(${connectionId}::uuid,${hook.user_id}::uuid,${fingerprint},${packageId},${orderNumber},${status},${eventAt}::timestamptz,${total},${lines.length},${JSON.stringify(lines)}::jsonb) on conflict (event_fingerprint) do nothing returning id`
    if(!inserted.length){duplicates++;continue}
    await sql`insert into public.marketplace_live_orders(connection_id,user_id,package_id,order_number,status,event_at,total_amount,line_count,updated_at) values(${connectionId}::uuid,${hook.user_id}::uuid,${packageId},${orderNumber},${status},${eventAt}::timestamptz,${total},${lines.length},now()) on conflict (connection_id,package_id) do update set order_number=excluded.order_number,status=excluded.status,event_at=excluded.event_at,total_amount=excluded.total_amount,line_count=excluded.line_count,updated_at=now() where excluded.event_at>=public.marketplace_live_orders.event_at`
    accepted++
  }
  return json(200,{ok:true,accepted,duplicates,skipped})
  }catch(error){console.error('order-events failed',error instanceof Error?error.message:'unknown');await captureMonitoringException(error,{functionName:'order-events'});return json(500,{error:'INTERNAL_ERROR'})}
})
