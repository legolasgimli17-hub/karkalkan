import { createTransactionPool } from '../_shared/postgres.ts'
import { consumeRateLimit } from '../_shared/request-security.ts'

const sql=createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL')||'')
const encoder=new TextEncoder()
const ALLOWED_DAYS=new Set([7,30,90])

function headers(){return {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}}
function json(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:headers()})}
function clean(value:unknown,max:number){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)}
function isUuid(value:unknown){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',encoder.encode(value));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}

async function authenticateApiKey(req:Request){
  const authorization=req.headers.get('Authorization')||''
  if(!authorization.startsWith('Bearer kk_live_'))return null
  const secret=authorization.slice(7)
  if(secret.length<40||secret.length>100)return null
  const hash=await sha256(secret)
  const rows=await sql!`select id,user_id,scopes from public.developer_api_keys where key_hash=${hash} and revoked_at is null and (expires_at is null or expires_at>now()) limit 1`
  const key=rows[0]
  if(!key)return null
  await sql!`update public.developer_api_keys set last_used_at=now(),updated_at=now() where id=${key.id}::uuid and (last_used_at is null or last_used_at<now()-interval '5 minutes')`.catch(()=>{})
  return {id:String(key.id),userId:String(key.user_id),scopes:new Set<string>(Array.isArray(key.scopes)?key.scopes.map(String):[])}
}

async function ownedConnection(userId:string,connectionId:string){
  const rows=await sql!`select id,marketplace,status,last_sync_at,last_sync_status,created_at from public.marketplace_connections where id=${connectionId}::uuid and user_id=${userId}::uuid limit 1`
  return rows[0]||null
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'})
  if(!sql)return json(503,{error:'SERVER_CONFIG'})

  const key=await authenticateApiKey(req)
  if(!key)return json(401,{error:'UNAUTHORIZED'})
  try{if(!(await consumeRateLimit(sql,'public-api-v1',key.id,120,60)))return json(429,{error:'RATE_LIMITED'})}catch{return json(503,{error:'RATE_LIMIT_UNAVAILABLE'})}

  const url=new URL(req.url),resource=clean(url.searchParams.get('resource')||'connections',30)
  if(resource==='connections'){
    if(!key.scopes.has('connections:read'))return json(403,{error:'SCOPE_REQUIRED',scope:'connections:read'})
    const rows=await sql`select id,marketplace,status,last_sync_at,last_sync_status,created_at from public.marketplace_connections where user_id=${key.userId}::uuid order by created_at desc limit 50`
    return json(200,{object:'list',data:rows.map((row:any)=>({id:row.id,marketplace:row.marketplace,status:row.status,lastSyncAt:row.last_sync_at,lastSyncStatus:row.last_sync_status,createdAt:row.created_at})),meta:{apiVersion:'2026-08-22',piiIncluded:false}})
  }

  if(!['finance','products'].includes(resource))return json(404,{error:'RESOURCE_NOT_FOUND'})
  const connectionId=clean(url.searchParams.get('connection_id'),36)
  const days=Number(url.searchParams.get('days')||30)
  if(!isUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'})
  if(!ALLOWED_DAYS.has(days))return json(400,{error:'INVALID_RANGE',allowedDays:[7,30,90]})
  const connection=await ownedConnection(key.userId,connectionId)
  if(!connection)return json(404,{error:'NOT_FOUND'})

  if(resource==='finance'){
    if(!key.scopes.has('finance:read'))return json(403,{error:'SCOPE_REQUIRED',scope:'finance:read'})
    const rows=await sql`select currency,
      coalesce(sum(gross_sales),0)::numeric as gross_sales,
      coalesce(sum(gross_returns),0)::numeric as gross_returns,
      coalesce(sum(commission_cost),0)::numeric as commission_cost,
      coalesce(sum(discount_cost),0)::numeric as discount_cost,
      coalesce(sum(coupon_cost),0)::numeric as coupon_cost,
      coalesce(sum(platform_service_fee_cost),0)::numeric as platform_service_fee_cost,
      coalesce(sum(stoppage_net),0)::numeric as stoppage_net,
      coalesce(sum(cargo_cost),0)::numeric as cargo_cost,
      coalesce(sum(seller_revenue),0)::numeric as seller_revenue,
      coalesce(sum(transaction_count),0)::bigint as transaction_count,
      min(day)::text as period_start,max(day)::text as period_end
      from public.marketplace_daily_financials
      where connection_id=${connectionId}::uuid and user_id=${key.userId}::uuid
        and day >= (timezone('Europe/Istanbul',now())::date-(${days-1}::int))
      group by currency order by currency`
    return json(200,{object:'finance_summary',connection:{id:connection.id,marketplace:connection.marketplace},days,data:rows.map((row:any)=>({currency:row.currency,grossSales:Number(row.gross_sales),grossReturns:Number(row.gross_returns),commissionCost:Number(row.commission_cost),discountCost:Number(row.discount_cost),couponCost:Number(row.coupon_cost),platformServiceFeeCost:Number(row.platform_service_fee_cost),stoppageNet:Number(row.stoppage_net),cargoCost:Number(row.cargo_cost),sellerRevenue:Number(row.seller_revenue),transactionCount:Number(row.transaction_count),periodStart:row.period_start,periodEnd:row.period_end})),meta:{apiVersion:'2026-08-22',authority:'deterministic_financial_ledger',piiIncluded:false}})
  }

  if(!key.scopes.has('products:read'))return json(403,{error:'SCOPE_REQUIRED',scope:'products:read'})
  const rows=await sql`select external_product_id,max(product_name) as product_name,max(sku) as sku,max(barcode) as barcode,
    coalesce(sum(sales_units),0)::bigint as sales_units,coalesce(sum(return_units),0)::bigint as return_units,
    coalesce(sum(gross_sales),0)::numeric as gross_sales,coalesce(sum(gross_returns),0)::numeric as gross_returns,
    coalesce(sum(commission_cost),0)::numeric as commission_cost,coalesce(sum(seller_revenue),0)::numeric as seller_revenue,
    sum(known_cogs)::numeric as known_cogs,sum(estimated_profit)::numeric as estimated_profit,
    count(*) filter(where known_cogs is not null)::int as cost_known_days,count(*)::int as observed_days
    from public.marketplace_product_daily_metrics
    where connection_id=${connectionId}::uuid and user_id=${key.userId}::uuid
      and day >= (timezone('Europe/Istanbul',now())::date-(${days-1}::int))
    group by external_product_id order by coalesce(sum(seller_revenue),0) desc limit 100`
  return json(200,{object:'product_summary_list',connection:{id:connection.id,marketplace:connection.marketplace},days,data:rows.map((row:any)=>({externalProductId:row.external_product_id,productName:row.product_name,sku:row.sku,barcode:row.barcode,salesUnits:Number(row.sales_units),returnUnits:Number(row.return_units),grossSales:Number(row.gross_sales),grossReturns:Number(row.gross_returns),commissionCost:Number(row.commission_cost),sellerRevenue:Number(row.seller_revenue),knownCogs:row.known_cogs==null?null:Number(row.known_cogs),estimatedProfit:row.estimated_profit==null?null:Number(row.estimated_profit),costKnownDays:Number(row.cost_known_days),observedDays:Number(row.observed_days)})),meta:{apiVersion:'2026-08-22',limit:100,piiIncluded:false}})
})
