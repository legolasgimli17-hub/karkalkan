import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { createTransactionPool } from '../_shared/postgres.ts'
import { captureSafeFailure } from '../_shared/observability.ts'
import { readJsonBody, requestError } from '../_shared/request-security.ts'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
const DB_URL=Deno.env.get('KARKALKAN_DB_POOLER_URL')||''
const sql=createTransactionPool(DB_URL)
const ORDERS_URL='https://api.n11.com/rest/delivery/v1/shipmentPackages'
const RETURNS_URL='https://api.n11.com/ws/ReturnService'
const DAY_MS=86_400_000
const PAGE_SIZE=100
const MAX_PAGES=100
const WINDOW_DAYS=15
const INSERT_BATCH=300
const PACING_MS=75
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'})

type DailyAgg={
  grossSales:number;grossReturns:number;commissionCost:number;discountCost:number;couponCost:number
  serviceFeeCost:number;stoppageCost:number;sellerRevenue:number;count:number
}
type ProductAgg={
  day:string;externalId:string;sku:string|null;barcode:string|null;name:string|null;orders:Set<string>
  salesUnits:number;returnUnits:number;grossSales:number;grossReturns:number;commissionCost:number;sellerRevenue:number
}
type CostRow={external_product_id:string;cost_amount:number;valid_from:string;valid_to:string|null}
type OrderLineMeta={externalId:string;sku:string|null;barcode:string|null;name:string|null}

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
function num(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function cents(value:unknown){return Math.round(num(value)*100)}
function money(value:number){return Math.round(value)/100}
function integer(value:unknown){return Math.max(0,Math.trunc(num(value)))}
function clean(value:unknown,max:number){const text=String(value??'').trim().replace(/\s+/g,' ');return text?text.slice(0,max):''}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
function emptyDaily():DailyAgg{return {grossSales:0,grossReturns:0,commissionCost:0,discountCost:0,couponCost:0,serviceFeeCost:0,stoppageCost:0,sellerRevenue:0,count:0}}
function emptyProduct(day:string,externalId:string,meta?:Partial<OrderLineMeta>):ProductAgg{return {day,externalId,sku:meta?.sku||null,barcode:meta?.barcode||null,name:meta?.name||null,orders:new Set(),salesUnits:0,returnUnits:0,grossSales:0,grossReturns:0,commissionCost:0,sellerRevenue:0}}
function productKey(day:string,externalId:string){return `${day}\u0000${externalId}`}
function orderProductKey(order:unknown,product:unknown){const orderId=clean(order,100),productId=clean(product,180);return orderId&&productId?`${orderId}\u0000${productId}`:''}
function activeCost(rows:CostRow[]|undefined,day:string){for(const row of rows||[])if(row.valid_from<=day&&(!row.valid_to||row.valid_to>=day))return Number(row.cost_amount);return null}
function rangeForDays(days:number){
  const parts=dayFormatter.formatToParts(new Date()),get=(type:string)=>Number(parts.find(part=>part.type===type)?.value)
  const today=Date.UTC(get('year'),get('month')-1,get('day'))-3*60*60*1000
  return {start:today-(days-1)*DAY_MS,end:Date.now()}
}
function windows(start:number,end:number){
  const result:Array<{start:number;end:number}>=[]
  for(let cursor=start;cursor<=end;){const windowEnd=Math.min(end,cursor+WINDOW_DAYS*DAY_MS-1);result.push({start:cursor,end:windowEnd});cursor=windowEnd+1}
  return result
}
function dayKey(value:unknown){
  const timestamp=typeof value==='number'?value:Date.parse(String(value??''))
  if(!Number.isFinite(timestamp))return null
  const parts=dayFormatter.formatToParts(new Date(timestamp)),get=(type:string)=>parts.find(part=>part.type===type)?.value
  const year=get('year'),month=get('month'),day=get('day')
  return year&&month&&day?`${year}-${month}-${day}`:null
}
function soapDay(value:string){
  const match=value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return match?`${match[3]}-${match[2]}-${match[1]}`:null
}
function soapDate(timestamp:number){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date(timestamp))
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||''
  return `${get('day')}/${get('month')}/${get('year')}`
}
function xmlEscape(value:string){return value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]!))}
function xmlDecode(value:string){return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim()}
function xmlBlocks(xml:string,tag:string){const expression=new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`,'gi');return [...xml.matchAll(expression)].map(match=>match[1])}
function xmlValue(xml:string,tag:string){const block=xmlBlocks(xml,tag)[0];return block===undefined?'':xmlDecode(block.replace(/<[^>]*>/g,''))}
function lineDay(row:any){
  const histories=Array.isArray(row?.packageHistories)?row.packageHistories:[]
  const created=histories.find((item:any)=>clean(item?.status,40).toLowerCase()==='created')?.createdDate
  return dayKey(created??histories[0]?.createdDate??row?.lastModifiedDate)
}
function isCancelled(row:any,line:any){
  const states=[row?.shipmentPackageStatus,line?.orderItemLineItemStatusName].map(value=>clean(value,80).toLowerCase().replace(/\s+/g,''))
  return states.some(value=>['cancelled','canceled','unsupplied','iptaledilmiş','reddedilmiş'].includes(value))
}

async function restPage(url:URL,appKey:string,appSecret:string){
  let response:Response
  try{response=await fetch(url,{headers:{appkey:appKey,appsecret:appSecret,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(25_000)})}catch{throw new SyncError('N11_NETWORK',502)}
  if(response.status===401)throw new SyncError('N11_UNAUTHORIZED',401,401)
  if(response.status===403)throw new SyncError('N11_FORBIDDEN',502,403)
  if(response.status===429)throw new SyncError('N11_RATE_LIMIT',429,429)
  if(!response.ok)throw new SyncError('N11_HTTP_ERROR',502,response.status)
  try{return await response.json()}catch{throw new SyncError('N11_BAD_JSON',502,response.status)}
}

async function fetchOrders(start:number,end:number,appKey:string,appSecret:string){
  const rows:any[]=[]
  const seenPackages=new Set<string>()
  let pages=0
  for(const window of windows(start,end)){
    for(let page=0;page<MAX_PAGES;page++){
      const url=new URL(ORDERS_URL)
      for(const [key,value] of Object.entries({startDate:window.start,endDate:window.end,page,size:PAGE_SIZE,orderByDirection:'ASC',sender:'ALL'}))url.searchParams.set(key,String(value))
      const data=await restPage(url,appKey,appSecret),content=Array.isArray(data?.content)?data.content:[]
      pages++
      for(const item of content){
        const packageId=clean(item?.id,160)||`${clean(item?.orderNumber,100)}:${clean(item?.lastModifiedDate,40)}`
        if(packageId&&seenPackages.has(packageId))continue
        if(packageId)seenPackages.add(packageId)
        rows.push(item)
      }
      const totalPages=Math.max(0,integer(data?.totalPages??data?.pageCount))
      if(content.length<PAGE_SIZE||page+1>=totalPages)break
      if(page+1===MAX_PAGES)throw new SyncError('SYNC_TOO_LARGE',409)
      await sleep(PACING_MS)
    }
  }
  return {rows,pages}
}

function returnEnvelope(appKey:string,appSecret:string,start:number,end:number,page:number){return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas"><soapenv:Header/><soapenv:Body><sch:ClaimReturnListRequest><auth><appKey>${xmlEscape(appKey)}</appKey><appSecret>${xmlEscape(appSecret)}</appSecret></auth><searchData><status>ALL</status><sender>ALL</sender><period><startDate>${soapDate(start)}</startDate><endDate>${soapDate(end)}</endDate></period></searchData><pagingData><currentPage>${page}</currentPage></pagingData></sch:ClaimReturnListRequest></soapenv:Body></soapenv:Envelope>`}

async function fetchReturns(start:number,end:number,appKey:string,appSecret:string){
  const rows:Array<Record<string,string>>=[]
  const seen=new Set<string>()
  let pages=0
  for(const window of windows(start,end)){
    for(let page=0;page<MAX_PAGES;page++){
      let response:Response
      try{response=await fetch(RETURNS_URL,{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8',Accept:'text/xml'},body:returnEnvelope(appKey,appSecret,window.start,window.end,page),redirect:'error',signal:AbortSignal.timeout(25_000)})}catch{throw new SyncError('N11_RETURN_NETWORK',502)}
      if(response.status===401)throw new SyncError('N11_UNAUTHORIZED',401,401)
      if(response.status===403)throw new SyncError('N11_FORBIDDEN',502,403)
      if(response.status===429)throw new SyncError('N11_RATE_LIMIT',429,429)
      const xml=await response.text()
      if(!response.ok)throw new SyncError('N11_RETURN_HTTP_ERROR',502,response.status)
      if(xmlValue(xml,'status').toLowerCase()!=='success')throw new SyncError('N11_RETURN_API_FAILED',502)
      const blocks=xmlBlocks(xml,'claimReturn')
      pages++
      for(const block of blocks){
        const id=xmlValue(block,'claimReturnId')
        if(!id||seen.has(id))continue
        seen.add(id)
        const row:Record<string,string>={}
        for(const key of ['claimReturnId','status','orderNumber','productId','skuId','productName','quantity','finalPrice','approvedDate','requestDate','paymentDate'])row[key]=xmlValue(block,key)
        rows.push(row)
      }
      const pageCount=Math.max(0,integer(xmlValue(xml,'pageCount')))
      if(!blocks.length||page+1>=pageCount)break
      if(page+1===MAX_PAGES)throw new SyncError('SYNC_TOO_LARGE',409)
      await sleep(PACING_MS)
    }
  }
  return {rows,pages}
}

function aggregate(orders:any[],returns:Array<Record<string,string>>){
  const daily=new Map<string,DailyAgg>(),products=new Map<string,ProductAgg>(),lineMeta=new Map<string,OrderLineMeta>(),seenLines=new Set<string>()
  let cancelledLines=0,skippedLines=0
  for(const order of orders){
    const day=lineDay(order),orderNumber=clean(order?.orderNumber,100)
    for(const line of Array.isArray(order?.lines)?order.lines:[]){
      const rawId=clean(line?.orderLineId,160),dedupe=rawId||`${orderNumber}:${clean(line?.productId,120)}:${clean(line?.stockCode,180)}`
      if(!dedupe||seenLines.has(dedupe))continue
      seenLines.add(dedupe)
      if(isCancelled(order,line)){cancelledLines++;continue}
      if(!day){skippedLines++;continue}
      const quantity=integer(line?.quantity),productId=clean(line?.productId,180),barcode=clean(line?.barcode,180),sku=clean(line?.stockCode,180)
      const externalId=barcode||sku||productId
      if(!externalId||!quantity){skippedLines++;continue}
      const gross=Math.abs(cents(line?.price))*quantity
      const invoiceRaw=Math.abs(cents(line?.sellerInvoiceAmount))
      const sellerDiscount=Math.abs(cents(line?.sellerDiscount))*quantity
      const sellerCoupon=Math.abs(cents(line?.sellerCouponDiscount))*quantity
      const totalSellerDiscount=Math.abs(cents(line?.totalSellerDiscountPrice))
      const invoice=invoiceRaw||Math.max(0,gross-(totalSellerDiscount||sellerDiscount+sellerCoupon))
      const commissionRate=Math.max(0,num(line?.commissionRate)-num(line?.sellerCampaignCommissionRate))
      const commission=Math.round(invoice*commissionRate/100)
      const serviceRate=Math.max(0,num(line?.netMarketingFeeRate))+Math.max(0,num(line?.netMarketplaceFeeRate))
      const serviceFee=Math.round(invoice*serviceRate/100)
      const stoppage=Math.round(invoice*Math.max(0,num(line?.taxDeductionRate))/100)
      const revenue=invoice-commission-serviceFee-stoppage
      const dailyAgg=daily.get(day)||emptyDaily()
      dailyAgg.grossSales+=gross;dailyAgg.discountCost+=sellerDiscount;dailyAgg.couponCost+=sellerCoupon
      dailyAgg.commissionCost+=commission;dailyAgg.serviceFeeCost+=serviceFee;dailyAgg.stoppageCost+=stoppage;dailyAgg.sellerRevenue+=revenue;dailyAgg.count++
      daily.set(day,dailyAgg)
      const name=clean(line?.productName,300)||null,meta={externalId,sku:sku||null,barcode:barcode||null,name}
      const key=productKey(day,externalId),product=products.get(key)||emptyProduct(day,externalId,meta)
      product.salesUnits+=quantity;product.grossSales+=gross;product.commissionCost+=commission;product.sellerRevenue+=revenue
      if(orderNumber)product.orders.add(orderNumber)
      products.set(key,product)
      for(const candidate of [productId,clean(line?.skuId,180),externalId]){const mapping=orderProductKey(orderNumber,candidate);if(mapping)lineMeta.set(mapping,meta)}
    }
  }
  let approvedReturns=0,unmatchedReturns=0
  for(const row of returns){
    if(!['APPROVED','MANUAL_REFUND'].includes(clean(row.status,40).toUpperCase()))continue
    const day=soapDay(row.approvedDate||row.requestDate||row.paymentDate)
    if(!day)continue
    const orderNumber=clean(row.orderNumber,100),productId=clean(row.productId||row.skuId,180)
    const meta=lineMeta.get(orderProductKey(orderNumber,productId)),externalId=meta?.externalId||clean(row.skuId,180)||productId
    if(!externalId){unmatchedReturns++;continue}
    const quantity=Math.max(1,integer(row.quantity)),amount=Math.abs(cents(row.finalPrice))
    const dailyAgg=daily.get(day)||emptyDaily();dailyAgg.grossReturns+=amount;dailyAgg.sellerRevenue-=amount;dailyAgg.count++;daily.set(day,dailyAgg)
    const key=productKey(day,externalId),product=products.get(key)||emptyProduct(day,externalId,meta||{name:clean(row.productName,300)||null})
    product.returnUnits+=quantity;product.grossReturns+=amount;product.sellerRevenue-=amount;if(orderNumber)product.orders.add(orderNumber);products.set(key,product)
    approvedReturns++
  }
  return {daily,products,cancelledLines,skippedLines,approvedReturns,unmatchedReturns}
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
  if(!connection||connection.marketplace!=='n11')return json(404,{error:'NOT_FOUND'},origin)

  const lockToken=crypto.randomUUID(),{start,end}=rangeForDays(days),startDay=dayKey(start)!,endDay=dayKey(end)!
  let runId:string|null=null,lockHeld=false
  const safeFail=async(code:string,status='failed',cause?:unknown)=>{
    try{if(runId)await sql`update public.marketplace_sync_runs set status=${status},safe_error_code=${code},finished_at=now() where id=${runId}::uuid and user_id=${user.id}::uuid`}catch{}
    await captureSafeFailure('n11-sync',code,cause)
  }
  try{
    const locked=await sql`update public.marketplace_connections set sync_lock_token=${lockToken}::uuid,sync_lock_until=now()+interval '10 minutes' where id=${connectionId}::uuid and user_id=${user.id}::uuid and (sync_lock_until is null or sync_lock_until<now()) returning id`
    if(!locked.length)return json(409,{error:'SYNC_IN_PROGRESS'},origin)
    lockHeld=true
    const runRows=await sql`insert into public.marketplace_sync_runs(connection_id,user_id,range_start,range_end,status,worker_version) values(${connectionId}::uuid,${user.id}::uuid,to_timestamp(${start}/1000.0),to_timestamp(${end}/1000.0),'running','n11-order-finance-v1') returning id`
    runId=String(runRows[0].id)
    const keyName=`kk.n11.${connectionId}.app_key`,secretName=`kk.n11.${connectionId}.app_secret`
    const secretRows=await sql`select name,decrypted_secret from vault.decrypted_secrets where name in (${keyName},${secretName})`
    const secrets=new Map(secretRows.map((row:any)=>[String(row.name),String(row.decrypted_secret||'')]))
    const appKey=secrets.get(keyName)||'',appSecret=secrets.get(secretName)||''
    if(!appKey||!appSecret){await safeFail('CREDENTIALS_MISSING');return json(409,{error:'CREDENTIALS_MISSING'},origin)}

    const [orders,returns]=await Promise.all([fetchOrders(start,end,appKey,appSecret),fetchReturns(start,end,appKey,appSecret)])
    const result=aggregate(orders.rows,returns.rows)
    const costRows=await sql<CostRow[]>`select external_product_id,cost_amount,valid_from::text,valid_to::text from public.marketplace_product_costs where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid order by external_product_id,valid_from desc`
    const costs=new Map<string,CostRow[]>()
    for(const row of costRows){const list=costs.get(String(row.external_product_id))||[];list.push(row);costs.set(String(row.external_product_id),list)}
    const now=new Date().toISOString()
    const productRows=[...result.products.values()].map(product=>{
      const netUnits=Math.max(0,product.salesUnits-product.returnUnits),cost=activeCost(costs.get(product.externalId),product.day)
      const knownCogs=cost===null?null:Math.round(cost*netUnits*100)/100,revenue=money(product.sellerRevenue)
      const profit=knownCogs===null?null:Math.round((revenue-knownCogs)*100)/100,margin=profit===null||revenue===0?null:Math.round(profit/revenue*10000)/100
      return {connection_id:connectionId,user_id:user.id,day:product.day,external_product_id:product.externalId,sku:product.sku,barcode:product.barcode,product_name:product.name,orders:product.orders.size,units:netUnits,sales_units:product.salesUnits,return_units:product.returnUnits,unit_basis:'n11_order_api_with_approved_returns_v1',sales_unit_basis:'n11_shipment_line_quantity',return_unit_basis:'n11_approved_return_quantity',order_line_matches:product.orders.size,return_proxy_matches:0,claim_item_matches:product.returnUnits,gross_sales:money(product.grossSales),gross_returns:money(product.grossReturns),commission_cost:money(product.commissionCost),seller_revenue:revenue,known_cogs:knownCogs,estimated_profit:profit,estimated_margin:margin,profit_confidence:knownCogs===null?'platform_only':'cost_known',updated_at:now}
    })
    const summary={provider:'n11',source:'official_order_and_return_apis',coverage:'n11_order_api_estimate_v1',orders:orders.rows.length,orderPages:orders.pages,returnClaims:returns.rows.length,returnPages:returns.pages,approvedReturns:result.approvedReturns,cancelledLines:result.cancelledLines,skippedLines:result.skippedLines,unmatchedReturns:result.unmatchedReturns,days:result.daily.size,productRows:productRows.length,knownLimitations:['cargo_and_statement_adjustments_require_n11_payment_detail_report'],realStoreVerification:'pending_first_authorized_merchant'}

    await sql.begin(async tx=>{
      await tx`update public.marketplace_daily_financials set gross_sales=0,gross_returns=0,commission_cost=0,discount_cost=0,coupon_cost=0,provision_net=0,manual_refund_net=0,platform_promo_net=0,delivery_fee_net=0,correction_net=0,settlement_adjustment_net=0,platform_service_fee_cost=0,cargo_cost=0,stoppage_net=0,seller_revenue=0,transaction_count=0,settlement_coverage='n11_order_api_estimate_v1',other_financial_coverage='n11_order_api_partial_v1',updated_at=now() where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`
      for(const [day,aggregate] of result.daily)await tx`insert into public.marketplace_daily_financials(connection_id,user_id,day,currency,gross_sales,gross_returns,commission_cost,discount_cost,coupon_cost,provision_net,manual_refund_net,platform_promo_net,delivery_fee_net,correction_net,settlement_adjustment_net,platform_service_fee_cost,cargo_cost,stoppage_net,settlement_coverage,other_financial_coverage,seller_revenue,transaction_count,source_window_start,source_window_end) values(${connectionId}::uuid,${user.id}::uuid,${day}::date,'TRY',${money(aggregate.grossSales)},${money(aggregate.grossReturns)},${money(aggregate.commissionCost)},${money(aggregate.discountCost)},${money(aggregate.couponCost)},0,0,0,0,0,0,${money(aggregate.serviceFeeCost)},0,${money(aggregate.stoppageCost)},'n11_order_api_estimate_v1','n11_order_api_partial_v1',${money(aggregate.sellerRevenue)},${aggregate.count},to_timestamp(${start}/1000.0),to_timestamp(${end}/1000.0)) on conflict (connection_id,day,currency) do update set gross_sales=excluded.gross_sales,gross_returns=excluded.gross_returns,commission_cost=excluded.commission_cost,discount_cost=excluded.discount_cost,coupon_cost=excluded.coupon_cost,provision_net=excluded.provision_net,manual_refund_net=excluded.manual_refund_net,platform_promo_net=excluded.platform_promo_net,delivery_fee_net=excluded.delivery_fee_net,correction_net=excluded.correction_net,settlement_adjustment_net=excluded.settlement_adjustment_net,platform_service_fee_cost=excluded.platform_service_fee_cost,cargo_cost=excluded.cargo_cost,stoppage_net=excluded.stoppage_net,settlement_coverage=excluded.settlement_coverage,other_financial_coverage=excluded.other_financial_coverage,seller_revenue=excluded.seller_revenue,transaction_count=excluded.transaction_count,source_window_start=excluded.source_window_start,source_window_end=excluded.source_window_end,updated_at=now()`
      await tx`delete from public.marketplace_product_daily_metrics where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`
      for(let index=0;index<productRows.length;index+=INSERT_BATCH){const batch=productRows.slice(index,index+INSERT_BATCH);if(batch.length)await tx`insert into public.marketplace_product_daily_metrics ${tx(batch,'connection_id','user_id','day','external_product_id','sku','barcode','product_name','orders','units','sales_units','return_units','unit_basis','sales_unit_basis','return_unit_basis','order_line_matches','return_proxy_matches','claim_item_matches','gross_sales','gross_returns','commission_cost','seller_revenue','known_cogs','estimated_profit','estimated_margin','profit_confidence','updated_at')}`}
      await tx`update public.marketplace_sync_runs set status='success',imported_orders=${orders.rows.length},imported_transactions=${orders.rows.length+result.approvedReturns},finished_at=now(),result_summary=${JSON.stringify(summary)}::jsonb where id=${runId}::uuid and user_id=${user.id}::uuid`
      await tx`update public.marketplace_connections set status='connected',last_sync_at=now(),last_sync_status='success',updated_at=now() where id=${connectionId}::uuid and user_id=${user.id}::uuid`
    })
    return json(200,{ok:true,...summary,rangeDays:days,startDay,endDay,importedTransactions:orders.rows.length+result.approvedReturns,dailyRows:result.daily.size},origin)
  }catch(error){
    const syncError=error instanceof SyncError?error:null,code=syncError?.code||'INTERNAL_ERROR'
    if(code==='N11_UNAUTHORIZED'){try{await sql`update public.marketplace_connections set status='reauth_required',last_sync_status='failed',updated_at=now() where id=${connectionId}::uuid and user_id=${user.id}::uuid`}catch{}}
    await safeFail(code,code==='SYNC_TOO_LARGE'?'partial':'failed',error)
    console.error('n11-sync failed',code)
    return json(syncError?.httpStatus||500,{error:code,...(syncError?.upstreamStatus?{status:syncError.upstreamStatus}:{})},origin)
  }finally{
    if(lockHeld){try{await sql`update public.marketplace_connections set sync_lock_token=null,sync_lock_until=null where id=${connectionId}::uuid and user_id=${user.id}::uuid and sync_lock_token=${lockToken}::uuid`}catch{}}
  }
})
