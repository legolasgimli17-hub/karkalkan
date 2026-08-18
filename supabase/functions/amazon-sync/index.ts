import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { createTransactionPool } from '../_shared/postgres.ts'
import { captureSafeFailure } from '../_shared/observability.ts'
import { readJsonBody, requestError } from '../_shared/request-security.ts'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
const DB_URL=Deno.env.get('KARKALKAN_DB_POOLER_URL')||''
const sql=createTransactionPool(DB_URL)
const LWA_TOKEN_URL='https://api.amazon.com/auth/o2/token'
const SP_API_ORIGIN='https://sellingpartnerapi-eu.amazon.com'
const FINANCES_PATH='/finances/2024-06-19/transactions'
const TURKEY_MARKETPLACE_ID='A33AVAJ2PDY3EV'
const DAY_MS=86_400_000
const MAX_PAGES=60
const PAGE_PACING_MS=2_050
const INSERT_BATCH=300
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'})

type DailyAgg={
  grossSales:number;grossReturns:number;commissionCost:number;discountCost:number
  platformServiceFeeCost:number;cargoCost:number;settlementAdjustmentNet:number
  sellerRevenue:number;count:number
}
type ProductAgg={
  day:string;externalId:string;sku:string|null;name:string|null;orders:Set<string>
  salesUnits:number;returnUnits:number;grossSales:number;grossReturns:number
  commissionCost:number;sellerRevenue:number
}
type CostRow={external_product_id:string;cost_amount:number;valid_from:string;valid_to:string|null}

class SyncError extends Error{
  constructor(public code:string,public httpStatus:number,public upstreamStatus?:number){super(code)}
}

function allowedOrigin(origin:string|null){
  if(!origin)return true
  if(origin==='https://karkalkan.vercel.app'||origin===PROJECT_ORIGIN)return true
  try{const url=new URL(origin);return url.protocol==='https:'&&url.hostname.endsWith('-krgzabdullah22-8562s-projects.vercel.app')}catch{return false}
}
function responseHeaders(origin:string|null){
  const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'}
  if(origin&&allowedOrigin(origin)){
    headers['Access-Control-Allow-Origin']=origin
    headers['Access-Control-Allow-Headers']='authorization, apikey, content-type'
    headers['Access-Control-Allow-Methods']='POST, OPTIONS'
  }
  return headers
}
function json(status:number,body:unknown,origin:string|null){return new Response(JSON.stringify(body),{status,headers:responseHeaders(origin)})}
function validUuid(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)}
function clean(value:unknown,max:number){return String(value??'').trim().replace(/\s+/g,' ').slice(0,max)}
function numeric(value:unknown){const number=Number(value);return Number.isFinite(number)?number:0}
function cents(value:unknown){return Math.round(numeric(value)*100)}
function money(value:number){return Math.round(value)/100}
function integer(value:unknown){return Math.max(0,Math.trunc(numeric(value)))}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
function configuredValue(name:string,max:number){const value=String(Deno.env.get(name)||'').trim();return value&&value.length<=max?value:''}
function dayKey(value:unknown){
  const timestamp=Date.parse(String(value??''))
  if(!Number.isFinite(timestamp))return null
  const parts=dayFormatter.formatToParts(new Date(timestamp)),get=(type:string)=>parts.find(part=>part.type===type)?.value
  const year=get('year'),month=get('month'),day=get('day')
  return year&&month&&day?`${year}-${month}-${day}`:null
}
function emptyDaily():DailyAgg{return {grossSales:0,grossReturns:0,commissionCost:0,discountCost:0,platformServiceFeeCost:0,cargoCost:0,settlementAdjustmentNet:0,sellerRevenue:0,count:0}}
function productKey(day:string,id:string){return `${day}\u0000${id}`}
function emptyProduct(day:string,externalId:string,sku:string|null,name:string|null):ProductAgg{return {day,externalId,sku,name,orders:new Set(),salesUnits:0,returnUnits:0,grossSales:0,grossReturns:0,commissionCost:0,sellerRevenue:0}}
function activeCost(rows:CostRow[]|undefined,day:string){for(const row of rows||[])if(row.valid_from<=day&&(!row.valid_to||row.valid_to>=day))return Number(row.cost_amount);return null}
function currencyAmount(value:any){
  if(value==null)return 0
  const currency=clean(value?.currencyCode,10).toUpperCase()
  if(currency&&currency!=='TRY')throw new SyncError('UNSUPPORTED_CURRENCY',409)
  return cents(value?.currencyAmount)
}
function breakdownAmount(node:any){return currencyAmount(node?.breakdownAmount)}
function breakdownType(node:any){return clean(node?.breakdownType,160)}
function childBreakdowns(node:any){return Array.isArray(node?.breakdowns)?node.breakdowns:[]}
function sumMatching(nodes:any[],predicate:(type:string)=>boolean):number{
  let total=0
  for(const node of nodes){
    if(predicate(breakdownType(node)))total+=breakdownAmount(node)
    else total+=sumMatching(childBreakdowns(node),predicate)
  }
  return total
}
function collectTopLevelUnknown(nodes:any[],unknown:Set<string>){
  for(const node of nodes){
    const type=breakdownType(node)
    if(type&&!/^(Sales|Expenses|Product\s?Charges?|Amazon\s?Fees?|Promotions?|Discounts?|Coupons?)$/i.test(type))unknown.add(type)
  }
}
function classifyBreakdowns(nodes:any[]){
  const product=sumMatching(nodes,type=>/^Product\s?Charges?$/i.test(type))
  const amazonFees=sumMatching(nodes,type=>/^Amazon\s?Fees?$/i.test(type))
  const promotions=sumMatching(nodes,type=>/^(Promotions?|Discounts?|Coupons?)$/i.test(type))
  const commission=sumMatching(nodes,type=>/(Commission|ReferralFee|SellingFee)/i.test(type))
  const cargo=sumMatching(nodes,type=>/(FulfillmentFee|ShippingFee|Postage|Carrier|DeliveryFee|Freight)/i.test(type))
  return {product,amazonFees,promotions,commission,cargo,serviceFees:amazonFees-commission-cargo}
}
function productContext(item:any){
  const contexts=Array.isArray(item?.contexts)?item.contexts:[]
  return contexts.find((context:any)=>clean(context?.contextType,80)==='ProductContext')||contexts.find((context:any)=>context?.sku||context?.asin)||null
}
function orderId(transaction:any){
  const identifiers=Array.isArray(transaction?.relatedIdentifiers)?transaction.relatedIdentifiers:[]
  const row=identifiers.find((item:any)=>clean(item?.relatedIdentifierName,80)==='ORDER_ID')
  return clean(row?.relatedIdentifierValue,120)
}
function amzDate(date=new Date()){return date.toISOString().replace(/[:-]|\.\d{3}/g,'')}

async function lwaAccessToken(refreshToken:string){
  const clientId=configuredValue('AMAZON_LWA_CLIENT_ID',300),clientSecret=configuredValue('AMAZON_LWA_CLIENT_SECRET',500)
  if(!clientId||!clientSecret)throw new SyncError('AMAZON_APP_NOT_CONFIGURED',409)
  let response:Response
  try{
    response=await fetch(LWA_TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',Accept:'application/json'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken,client_id:clientId,client_secret:clientSecret}),redirect:'error',signal:AbortSignal.timeout(20_000)})
  }catch{throw new SyncError('AMAZON_TOKEN_NETWORK',502)}
  if(response.status===400||response.status===401)throw new SyncError('AMAZON_REAUTH_REQUIRED',401,response.status)
  if(!response.ok)throw new SyncError('AMAZON_TOKEN_HTTP_ERROR',502,response.status)
  let body:any
  try{body=await response.json()}catch{throw new SyncError('AMAZON_TOKEN_BAD_JSON',502,response.status)}
  const token=String(body?.access_token||'')
  if(token.length<20||token.length>4096)throw new SyncError('AMAZON_TOKEN_INVALID',502)
  return token
}

async function financePage(accessToken:string,start:number,end:number,nextToken?:string){
  const url=new URL(FINANCES_PATH,SP_API_ORIGIN)
  url.searchParams.set('postedAfter',new Date(start).toISOString())
  url.searchParams.set('postedBefore',new Date(end).toISOString())
  url.searchParams.set('marketplaceId',TURKEY_MARKETPLACE_ID)
  if(nextToken)url.searchParams.set('nextToken',nextToken)
  for(let attempt=0;attempt<3;attempt++){
    let response:Response
    try{
      response=await fetch(url,{headers:{Accept:'application/json','x-amz-access-token':accessToken,'x-amz-date':amzDate(),'User-Agent':'Karkalkan/1.0 (Language=Deno; Marketplace=AmazonTR)'},redirect:'error',signal:AbortSignal.timeout(30_000)})
    }catch{if(attempt<2){await sleep(1_000*(attempt+1));continue}throw new SyncError('AMAZON_NETWORK',502)}
    if(response.status===401)throw new SyncError('AMAZON_REAUTH_REQUIRED',401,401)
    if(response.status===403)throw new SyncError('AMAZON_FORBIDDEN',403,403)
    if(response.status===429||response.status>=500){if(attempt<2){await sleep(1_000*(attempt+1));continue}throw new SyncError(response.status===429?'AMAZON_RATE_LIMIT':'AMAZON_HTTP_ERROR',response.status===429?429:502,response.status)}
    if(!response.ok)throw new SyncError('AMAZON_HTTP_ERROR',502,response.status)
    try{return await response.json()}catch{throw new SyncError('AMAZON_BAD_JSON',502,response.status)}
  }
  throw new SyncError('AMAZON_HTTP_ERROR',502)
}

async function fetchTransactions(accessToken:string,start:number,end:number){
  const rows:any[]=[],seen=new Set<string>()
  let nextToken=''
  for(let page=0;page<MAX_PAGES;page++){
    const body=await financePage(accessToken,start,end,nextToken||undefined)
    const payload=body?.payload&&typeof body.payload==='object'?body.payload:body
    const pageRows=Array.isArray(payload?.transactions)?payload.transactions:[]
    for(const row of pageRows){
      const id=clean(row?.transactionId,240)
      if(id&&seen.has(id))continue
      if(id)seen.add(id)
      rows.push(row)
    }
    nextToken=clean(payload?.nextToken,4096)
    if(!nextToken)return {rows,pages:page+1}
    if(page+1<MAX_PAGES)await sleep(PAGE_PACING_MS)
  }
  throw new SyncError('SYNC_TOO_LARGE',409)
}

function aggregate(rows:any[]){
  const daily=new Map<string,DailyAgg>(),products=new Map<string,ProductAgg>(),unknownBreakdowns=new Set<string>(),orders=new Set<string>()
  let deferredSkipped=0,missingDateSkipped=0,missingProductContext=0
  for(const transaction of rows){
    const status=clean(transaction?.transactionStatus,40).toUpperCase()
    if(status==='DEFERRED'){deferredSkipped++;continue}
    const marketplace=clean(transaction?.marketplaceDetails?.marketplaceId??transaction?.sellingPartnerMetadata?.marketplaceId,80)
    if(marketplace&&marketplace!==TURKEY_MARKETPLACE_ID)throw new SyncError('AMAZON_MARKETPLACE_MISMATCH',409)
    const day=dayKey(transaction?.postedDate)
    if(!day){missingDateSkipped++;continue}
    const total=currencyAmount(transaction?.totalAmount),nodes=Array.isArray(transaction?.breakdowns)?transaction.breakdowns:[]
    const breakdown=classifyBreakdowns(nodes)
    collectTopLevelUnknown(nodes,unknownBreakdowns)
    const dailyAgg=daily.get(day)||emptyDaily()
    if(breakdown.product>=0)dailyAgg.grossSales+=breakdown.product
    else dailyAgg.grossReturns+=Math.abs(breakdown.product)
    dailyAgg.commissionCost-=breakdown.commission
    dailyAgg.discountCost-=breakdown.promotions
    dailyAgg.cargoCost-=breakdown.cargo
    dailyAgg.platformServiceFeeCost-=breakdown.serviceFees
    dailyAgg.settlementAdjustmentNet+=total-(breakdown.product+breakdown.amazonFees+breakdown.promotions)
    dailyAgg.sellerRevenue+=total
    dailyAgg.count++
    daily.set(day,dailyAgg)
    const currentOrder=orderId(transaction)
    if(currentOrder)orders.add(currentOrder)

    const items=Array.isArray(transaction?.items)?transaction.items:[]
    for(const item of items){
      const context=productContext(item)
      const sku=clean(context?.sku,180)||null,asin=clean(context?.asin,180),externalId=sku||asin
      if(!externalId){missingProductContext++;continue}
      const itemNodes=Array.isArray(item?.breakdowns)?item.breakdowns:[]
      const itemBreakdown=classifyBreakdowns(itemNodes),itemTotal=currencyAmount(item?.totalAmount)
      const quantity=Math.max(1,integer(context?.quantityShipped)),key=productKey(day,externalId)
      const product=products.get(key)||emptyProduct(day,externalId,sku,clean(item?.description,300)||null)
      if(itemBreakdown.product>=0){product.grossSales+=itemBreakdown.product;if(itemBreakdown.product)product.salesUnits+=quantity}
      else{product.grossReturns+=Math.abs(itemBreakdown.product);product.returnUnits+=quantity}
      product.commissionCost-=itemBreakdown.commission
      product.sellerRevenue+=itemTotal
      if(currentOrder)product.orders.add(currentOrder)
      products.set(key,product)
    }
  }
  return {daily,products,orders:orders.size,unknownBreakdowns:[...unknownBreakdowns].sort().slice(0,50),deferredSkipped,missingDateSkipped,missingProductContext}
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  const auth=req.headers.get('Authorization')||''
  if(!auth.startsWith('Bearer '))return json(401,{error:'UNAUTHORIZED'},origin)
  let publishable=''
  try{publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||''}catch{}
  if(!PROJECT_URL||!publishable||!sql)return json(503,{error:'SERVER_CONFIG'},origin)
  const userClient=createClient(PROJECT_URL,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
  const token=auth.slice(7),{data:userData,error:userError}=await userClient.auth.getUser(token),user=userData?.user
  if(userError||!user)return json(401,{error:'UNAUTHORIZED'},origin)
  let body:any
  try{body=await readJsonBody(req,16*1024)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}
  const connectionId=String(body?.connection_id||''),days=Number(body?.days||30)
  if(!validUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
  if(![7,30].includes(days))return json(400,{error:'INVALID_RANGE'},origin)
  const {data:connection,error:connectionError}=await userClient.from('marketplace_connections').select('id,marketplace,status').eq('id',connectionId).maybeSingle()
  if(connectionError)return json(500,{error:'DB_ERROR'},origin)
  if(!connection||connection.marketplace!=='amazon')return json(404,{error:'NOT_FOUND'},origin)

  const lockToken=crypto.randomUUID(),end=Date.now()-3*60_000,start=end-days*DAY_MS,startDay=dayKey(start)!,endDay=dayKey(end)!
  let runId:string|null=null,lockHeld=false
  const safeFail=async(code:string,status='failed',cause?:unknown)=>{
    try{if(runId)await sql`update public.marketplace_sync_runs set status=${status},safe_error_code=${code},finished_at=now() where id=${runId}::uuid and user_id=${user.id}::uuid`}catch{}
    await captureSafeFailure('amazon-sync',code,cause)
  }
  try{
    const locked=await sql`update public.marketplace_connections set sync_lock_token=${lockToken}::uuid,sync_lock_until=now()+interval '10 minutes' where id=${connectionId}::uuid and user_id=${user.id}::uuid and (sync_lock_until is null or sync_lock_until<now()) returning id`
    if(!locked.length)return json(409,{error:'SYNC_IN_PROGRESS'},origin)
    lockHeld=true
    const runRows=await sql`insert into public.marketplace_sync_runs(connection_id,user_id,range_start,range_end,status,worker_version) values(${connectionId}::uuid,${user.id}::uuid,to_timestamp(${start}/1000.0),to_timestamp(${end}/1000.0),'running','amazon-finances-2024-06-19-v1') returning id`
    runId=String(runRows[0].id)
    const secretName=`kk.amazon.${connectionId}.refresh_token`
    const secretRows=await sql`select decrypted_secret from vault.decrypted_secrets where name=${secretName} limit 1`
    const refreshToken=String(secretRows[0]?.decrypted_secret||'')
    if(!refreshToken){await safeFail('AMAZON_AUTH_REQUIRED');return json(409,{error:'AMAZON_AUTH_REQUIRED'},origin)}
    const accessToken=await lwaAccessToken(refreshToken)
    const fetched=await fetchTransactions(accessToken,start,end),result=aggregate(fetched.rows)
    const costRows=await sql<CostRow[]>`select external_product_id,cost_amount,valid_from::text,valid_to::text from public.marketplace_product_costs where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid order by external_product_id,valid_from desc`
    const costs=new Map<string,CostRow[]>()
    for(const row of costRows){const list=costs.get(String(row.external_product_id))||[];list.push(row);costs.set(String(row.external_product_id),list)}
    const now=new Date().toISOString()
    const productRows=[...result.products.values()].map(product=>{
      const netUnits=Math.max(0,product.salesUnits-product.returnUnits),cost=activeCost(costs.get(product.externalId),product.day)
      const knownCogs=cost===null?null:Math.round(cost*netUnits*100)/100,revenue=money(product.sellerRevenue)
      const profit=knownCogs===null?null:Math.round((revenue-knownCogs)*100)/100,margin=profit===null||revenue===0?null:Math.round(profit/revenue*10000)/100
      return {connection_id:connectionId,user_id:user.id,day:product.day,external_product_id:product.externalId,sku:product.sku,barcode:null,product_name:product.name,orders:product.orders.size,units:netUnits,sales_units:product.salesUnits,return_units:product.returnUnits,unit_basis:'amazon_finances_2024_06_19',sales_unit_basis:'amazon_finances_product_context_quantity',return_unit_basis:'amazon_finances_product_context_quantity',order_line_matches:product.orders.size,return_proxy_matches:0,claim_item_matches:0,gross_sales:money(product.grossSales),gross_returns:money(product.grossReturns),commission_cost:money(product.commissionCost),seller_revenue:revenue,known_cogs:knownCogs,estimated_profit:profit,estimated_margin:margin,profit_confidence:knownCogs===null?'platform_only':'cost_known',updated_at:now}
    })
    const summary={provider:'amazon',marketplaceId:TURKEY_MARKETPLACE_ID,source:'official_sp_api_finances_2024_06_19',coverage:'amazon_finances_2024_06_19',transactions:fetched.rows.length,pages:fetched.pages,orders:result.orders,days:result.daily.size,productRows:productRows.length,deferredTransactionsSkipped:result.deferredSkipped,transactionsWithoutDateSkipped:result.missingDateSkipped,itemsWithoutProductContextSkipped:result.missingProductContext,unclassifiedTopLevelBreakdownTypes:result.unknownBreakdowns,knownLimitations:['financial_events_can_lag_up_to_48_hours','product_profit_uses_item_level_breakdowns_when_available'],realStoreVerification:'pending_first_authorized_seller'}

    await sql.begin(async tx=>{
      await tx`update public.marketplace_daily_financials set gross_sales=0,gross_returns=0,commission_cost=0,discount_cost=0,coupon_cost=0,provision_net=0,manual_refund_net=0,platform_promo_net=0,delivery_fee_net=0,correction_net=0,settlement_adjustment_net=0,platform_service_fee_cost=0,cargo_cost=0,stoppage_net=0,seller_revenue=0,transaction_count=0,settlement_coverage='amazon_finances_2024_06_19',other_financial_coverage='amazon_finances_2024_06_19',updated_at=now() where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`
      for(const [day,aggregate] of result.daily)await tx`insert into public.marketplace_daily_financials(connection_id,user_id,day,currency,gross_sales,gross_returns,commission_cost,discount_cost,coupon_cost,provision_net,manual_refund_net,platform_promo_net,delivery_fee_net,correction_net,settlement_adjustment_net,platform_service_fee_cost,cargo_cost,stoppage_net,settlement_coverage,other_financial_coverage,seller_revenue,transaction_count,source_window_start,source_window_end) values(${connectionId}::uuid,${user.id}::uuid,${day}::date,'TRY',${money(aggregate.grossSales)},${money(aggregate.grossReturns)},${money(aggregate.commissionCost)},${money(aggregate.discountCost)},0,0,0,0,0,0,${money(aggregate.settlementAdjustmentNet)},${money(aggregate.platformServiceFeeCost)},${money(aggregate.cargoCost)},0,'amazon_finances_2024_06_19','amazon_finances_2024_06_19',${money(aggregate.sellerRevenue)},${aggregate.count},to_timestamp(${start}/1000.0),to_timestamp(${end}/1000.0)) on conflict (connection_id,day,currency) do update set gross_sales=excluded.gross_sales,gross_returns=excluded.gross_returns,commission_cost=excluded.commission_cost,discount_cost=excluded.discount_cost,coupon_cost=excluded.coupon_cost,provision_net=excluded.provision_net,manual_refund_net=excluded.manual_refund_net,platform_promo_net=excluded.platform_promo_net,delivery_fee_net=excluded.delivery_fee_net,correction_net=excluded.correction_net,settlement_adjustment_net=excluded.settlement_adjustment_net,platform_service_fee_cost=excluded.platform_service_fee_cost,cargo_cost=excluded.cargo_cost,stoppage_net=excluded.stoppage_net,settlement_coverage=excluded.settlement_coverage,other_financial_coverage=excluded.other_financial_coverage,seller_revenue=excluded.seller_revenue,transaction_count=excluded.transaction_count,source_window_start=excluded.source_window_start,source_window_end=excluded.source_window_end,updated_at=now()`
      await tx`delete from public.marketplace_product_daily_metrics where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`
      for(let index=0;index<productRows.length;index+=INSERT_BATCH){const batch=productRows.slice(index,index+INSERT_BATCH);if(batch.length)await tx`insert into public.marketplace_product_daily_metrics ${tx(batch,'connection_id','user_id','day','external_product_id','sku','barcode','product_name','orders','units','sales_units','return_units','unit_basis','sales_unit_basis','return_unit_basis','order_line_matches','return_proxy_matches','claim_item_matches','gross_sales','gross_returns','commission_cost','seller_revenue','known_cogs','estimated_profit','estimated_margin','profit_confidence','updated_at')}`}
      await tx`update public.marketplace_sync_runs set status='success',imported_orders=${result.orders},imported_transactions=${fetched.rows.length-result.deferredSkipped},finished_at=now(),result_summary=${JSON.stringify(summary)}::jsonb where id=${runId}::uuid and user_id=${user.id}::uuid`
      await tx`update public.marketplace_connections set status='connected',last_sync_at=now(),last_sync_status='success',updated_at=now() where id=${connectionId}::uuid and user_id=${user.id}::uuid`
    })
    return json(200,{ok:true,...summary,rangeDays:days,startDay,endDay,importedTransactions:fetched.rows.length-result.deferredSkipped,dailyRows:result.daily.size},origin)
  }catch(error){
    const syncError=error instanceof SyncError?error:null,code=syncError?.code||'INTERNAL_ERROR'
    if(code==='AMAZON_REAUTH_REQUIRED'){try{await sql`update public.marketplace_connections set status='reauth_required',last_sync_status='failed',updated_at=now() where id=${connectionId}::uuid and user_id=${user.id}::uuid`}catch{}}
    await safeFail(code,code==='SYNC_TOO_LARGE'?'partial':'failed',error)
    console.error('amazon-sync failed',code)
    return json(syncError?.httpStatus||500,{error:code,...(syncError?.upstreamStatus?{status:syncError.upstreamStatus}:{})},origin)
  }finally{
    if(lockHeld){try{await sql`update public.marketplace_connections set sync_lock_token=null,sync_lock_until=null where id=${connectionId}::uuid and user_id=${user.id}::uuid and sync_lock_token=${lockToken}::uuid`}catch{}}
  }
})
