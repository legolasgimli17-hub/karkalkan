import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { createTransactionPool } from '../_shared/postgres.ts'
import { captureSafeFailure } from '../_shared/observability.ts'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
const DB_URL=Deno.env.get('KARKALKAN_DB_POOLER_URL')||''
const sql=createTransactionPool(DB_URL)
const API_ORIGIN='https://mpfinance-external.hepsiburada.com'
const TRANSACTIONS_PATH='/transactions/merchantid/'
const PERFORMANCE_PATH='/orders/merchantid/'
const DAY_MS=86_400_000
const PAGE_SIZE=100
const MAX_PAGES=100
const PACING_MS=100
const INSERT_BATCH=300
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'})

const CORE_SALE_TYPES=new Set(['Payment','BnplOrder'])
const CORE_RETURN_TYPES=new Set(['Return','BnplRefund'])
const COMMISSION_TYPES=new Set(['Commission','CommissionRefund','CommissionInvoiceRefund','CommissionCorrection','OverseasCommissionRefund'])
const DISCOUNT_TYPES=new Set(['CampaignDiscount','CampaignDiscountRefund','HepsiGlobalCampaignDiscount'])
const SERVICE_FEE_TYPES=new Set([
  'DeliveryProcessingFee','DeliveryProcessingFeeRefund','ReturnDeliveryProcessingFee',
  'ProcessingFeeExpense','ProcessingFeeExpenseRefund','ReturnProcessingFeeExpense',
  'PaymentServiceCostReflection','PaymentServiceCostReflectionRefund',
  'BnplProcessingFee','BnplProcessingFeeRefund'
])
const CARGO_TYPES=new Set([
  'ShipmentCostSharingExpense','ShipmentCostSharingIncome','DropShipmentCostSharingExpense',
  'DropShipmentCostSharingIncome','ReturnShipmentCostSharingExpense','OneClickReturnShipmentCostSharingExpense',
  'CargoCostRefund','CargoMargin','TransportExpense','TransportExpenseRefund'
])
const STOPPAGE_TYPES=new Set(['Stoppage','StoppageRefund','GoldLaborStoppage','GoldLaborStoppageRefund'])
const KNOWN_TYPES=new Set([...CORE_SALE_TYPES,...CORE_RETURN_TYPES,...COMMISSION_TYPES,...DISCOUNT_TYPES,...SERVICE_FEE_TYPES,...CARGO_TYPES,...STOPPAGE_TYPES])

type DailyAgg={
  grossSales:number;grossReturns:number;commissionCost:number;discountCost:number;couponCost:number
  provisionNet:number;manualRefundNet:number;platformPromoNet:number;deliveryFeeNet:number
  correctionNet:number;settlementAdjustmentNet:number;platformServiceFeeCost:number
  cargoCost:number;stoppageNet:number;sellerRevenue:number;count:number
}
type ProductAgg={
  day:string;sku:string;name:string|null;orders:Set<string>;salesUnits:number;returnUnits:number
  grossSales:number;grossReturns:number;commissionCost:number;sellerRevenue:number
}
type CostRow={external_product_id:string;cost_amount:number;valid_from:string;valid_to:string|null}

class SyncError extends Error{
  constructor(public code:string,public httpStatus:number,public upstreamStatus?:number){super(code)}
}

function allowedOrigin(origin:string|null){
  if(!origin)return true
  if(origin==='https://karkalkan.vercel.app'||origin===PROJECT_ORIGIN)return true
  try{const u=new URL(origin);return u.protocol==='https:'&&u.hostname.endsWith('-krgzabdullah22-8562s-projects.vercel.app')}catch{return false}
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
function positiveInt(value:unknown){return Math.max(0,Math.trunc(num(value)))}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
function basic(value:string){const bytes=new TextEncoder().encode(value);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)}
function cleanText(value:unknown,max:number){const text=String(value??'').trim().replace(/\s+/g,' ');return text?text.slice(0,max):''}
function amountCents(value:any){return cents(value?.value)}
function currencyCode(value:any){return String(value?.currencyCode??'').trim().toUpperCase()}
function isTryAmount(value:any){const code=currencyCode(value);return !code||code==='949'||code==='TRY'}
function rangeForDays(days:number){
  const parts=dayFormatter.formatToParts(new Date()),get=(type:string)=>Number(parts.find(part=>part.type===type)?.value)
  const today=Date.UTC(get('year'),get('month')-1,get('day'))-3*60*60*1000
  return {start:today-(days-1)*DAY_MS,end:Date.now()}
}
function dayKey(value:unknown){
  const timestamp=typeof value==='number'?value:Date.parse(String(value??''))
  if(!Number.isFinite(timestamp))return null
  const parts=dayFormatter.formatToParts(new Date(timestamp)),get=(type:string)=>parts.find(part=>part.type===type)?.value
  const year=get('year'),month=get('month'),day=get('day')
  return year&&month&&day?`${year}-${month}-${day}`:null
}
function emptyDaily():DailyAgg{return {
  grossSales:0,grossReturns:0,commissionCost:0,discountCost:0,couponCost:0,provisionNet:0,
  manualRefundNet:0,platformPromoNet:0,deliveryFeeNet:0,correctionNet:0,
  settlementAdjustmentNet:0,platformServiceFeeCost:0,cargoCost:0,stoppageNet:0,
  sellerRevenue:0,count:0
}}
function productKey(day:string,sku:string){return `${day}\u0000${sku}`}
function emptyProduct(day:string,sku:string,name:string|null):ProductAgg{return {day,sku,name,orders:new Set(),salesUnits:0,returnUnits:0,grossSales:0,grossReturns:0,commissionCost:0,sellerRevenue:0}}
function signedEffect(row:any){const value=Math.abs(amountCents(row?.amount));return row?.isIncome===true?value:-value}
function costEffect(row:any){return -signedEffect(row)}
function activeCost(rows:CostRow[]|undefined,day:string){for(const row of rows||[])if(row.valid_from<=day&&(!row.valid_to||row.valid_to>=day))return Number(row.cost_amount);return null}

async function apiPage(path:string,params:Record<string,string>,authHeader:string,userAgent:string){
  const url=new URL(`${API_ORIGIN}${path}`)
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,value)
  let response:Response
  try{
    response=await fetch(url,{headers:{Authorization:authHeader,'User-Agent':userAgent,Accept:'application/json'},signal:AbortSignal.timeout(25_000)})
  }catch(error){throw new SyncError('HEPSIBURADA_NETWORK',502)}
  if(response.status===401)throw new SyncError('HEPSIBURADA_UNAUTHORIZED',401,401)
  if(response.status===403)throw new SyncError('HEPSIBURADA_FORBIDDEN',502,403)
  if(response.status===409)throw new SyncError('HEPSIBURADA_CURRENCY_CONFLICT',409,409)
  if(response.status===429)throw new SyncError('HEPSIBURADA_RATE_LIMIT',429,429)
  if(!response.ok)throw new SyncError('HEPSIBURADA_HTTP_ERROR',502,response.status)
  try{return await response.json()}catch{throw new SyncError('HEPSIBURADA_BAD_JSON',502,response.status)}
}

async function fetchAll(kind:'transactions'|'orders',merchantId:string,start:number,end:number,authHeader:string,userAgent:string){
  const rows:any[]=[]
  const seen=new Set<string>()
  const totalField=kind==='transactions'?'count':'totalCount'
  const path=`${kind==='transactions'?TRANSACTIONS_PATH:PERFORMANCE_PATH}${encodeURIComponent(merchantId)}`
  for(let page=0;page<MAX_PAGES;page++){
    const offset=page*PAGE_SIZE
    const dateParams=kind==='transactions'
      ?{RecordDateStart:new Date(start).toISOString(),RecordDateEnd:new Date(end).toISOString()}
      :{OrderDateStart:new Date(start).toISOString(),OrderDateEnd:new Date(end).toISOString()}
    const data=await apiPage(path,{Offset:String(offset),Limit:String(PAGE_SIZE),...dateParams},authHeader,userAgent)
    const items=Array.isArray(data?.items)?data.items:[]
    for(const item of items){
      const fallback=`${kind}:${offset}:${rows.length}`
      const id=cleanText(item?.id,160)||cleanText(`${item?.orderNumber??''}:${item?.sku??''}:${item?.transactionType??''}:${item?.orderDate??''}:${item?.amount?.value??''}`,500)||fallback
      if(seen.has(id))continue
      seen.add(id);rows.push(item)
    }
    const total=positiveInt(data?.[totalField])
    if(items.length<PAGE_SIZE||(total>0&&offset+items.length>=total))return {rows,pages:page+1,total}
    if(page+1<MAX_PAGES)await sleep(PACING_MS)
  }
  throw new SyncError('SYNC_TOO_LARGE',409)
}

function classifyTransactions(rows:any[]){
  const daily=new Map<string,DailyAgg>()
  const returnsByProduct=new Map<string,{units:number;amount:number}>()
  const unknownTypes=new Set<string>()
  let skippedNoDate=0,skippedNoAmount=0
  for(const row of rows){
    if(!isTryAmount(row?.amount)||!isTryAmount(row?.netAmount)||!isTryAmount(row?.taxAmount))throw new SyncError('UNSUPPORTED_CURRENCY',409)
    const day=dayKey(row?.recordDate??row?.paymentDate??row?.invoiceDate??row?.dueDate??row?.orderDate)
    if(!day){skippedNoDate++;continue}
    const type=cleanText(row?.transactionType,100)
    const amount=Math.abs(amountCents(row?.amount))
    if(!amount){skippedNoAmount++;continue}
    const aggregate=daily.get(day)||emptyDaily()
    const effect=signedEffect(row)
    if(CORE_SALE_TYPES.has(type)){aggregate.grossSales+=amount;aggregate.sellerRevenue+=effect}
    else if(CORE_RETURN_TYPES.has(type)){
      aggregate.grossReturns+=amount;aggregate.sellerRevenue+=effect
      const sku=cleanText(row?.sku,180)
      if(sku){const key=productKey(day,sku),current=returnsByProduct.get(key)||{units:0,amount:0};current.units+=Math.max(1,positiveInt(row?.quantity));current.amount+=amount;returnsByProduct.set(key,current)}
    }
    else if(COMMISSION_TYPES.has(type)){aggregate.commissionCost+=costEffect(row);aggregate.sellerRevenue+=effect}
    else if(DISCOUNT_TYPES.has(type)){aggregate.discountCost+=costEffect(row);aggregate.sellerRevenue+=effect}
    else if(SERVICE_FEE_TYPES.has(type))aggregate.platformServiceFeeCost+=costEffect(row)
    else if(CARGO_TYPES.has(type))aggregate.cargoCost+=costEffect(row)
    else if(STOPPAGE_TYPES.has(type))aggregate.stoppageNet+=costEffect(row)
    else{aggregate.settlementAdjustmentNet+=effect;if(type&&!KNOWN_TYPES.has(type))unknownTypes.add(type)}
    aggregate.count++
    daily.set(day,aggregate)
  }
  return {daily,returnsByProduct,unknownTypes:[...unknownTypes].sort().slice(0,40),skippedNoDate,skippedNoAmount}
}

function itemAmount(items:any[],typeSet:Set<string>){let total=0;for(const item of items)if(typeSet.has(cleanText(item?.transactionType,100))){if(!isTryAmount(item?.amount))throw new SyncError('UNSUPPORTED_CURRENCY',409);total+=Math.abs(amountCents(item?.amount))}return total}

function aggregateProducts(rows:any[],returnsByProduct:Map<string,{units:number;amount:number}>){
  const products=new Map<string,ProductAgg>()
  let skippedNoSku=0,skippedNoDate=0
  for(const row of rows){
    for(const value of [row?.unitAmount,row?.allowanceAmount,row?.income?.totalAmount,row?.expense?.totalAmount])if(!isTryAmount(value))throw new SyncError('UNSUPPORTED_CURRENCY',409)
    const day=dayKey(row?.orderDate)
    if(!day){skippedNoDate++;continue}
    const sku=cleanText(row?.sku,180)
    if(!sku){skippedNoSku++;continue}
    const key=productKey(day,sku),name=cleanText(row?.productName,300)||null
    const aggregate=products.get(key)||emptyProduct(day,sku,name)
    const quantity=positiveInt(row?.quantity)
    const incomeItems=Array.isArray(row?.income?.items)?row.income.items:[]
    const expenseItems=Array.isArray(row?.expense?.items)?row.expense.items:[]
    for(const item of [...incomeItems,...expenseItems])if(!isTryAmount(item?.amount))throw new SyncError('UNSUPPORTED_CURRENCY',409)
    const unitAmount=Math.abs(amountCents(row?.unitAmount))
    const grossSale=unitAmount*quantity
    const income=Math.abs(amountCents(row?.income?.totalAmount))
    const expense=Math.abs(amountCents(row?.expense?.totalAmount))
    const commissionExpense=itemAmount(expenseItems,COMMISSION_TYPES)
    const commissionRefund=itemAmount(incomeItems,COMMISSION_TYPES)
    aggregate.salesUnits+=quantity
    aggregate.grossSales+=grossSale
    aggregate.commissionCost+=commissionExpense-commissionRefund
    aggregate.sellerRevenue+=income-expense
    aggregate.orders.add(cleanText(row?.orderNumber,100)||`${sku}:${day}:${products.size}`)
    if(!aggregate.name&&name)aggregate.name=name
    products.set(key,aggregate)
  }
  for(const [key,returned] of returnsByProduct){
    const existing=products.get(key)
    if(!existing)continue
    existing.returnUnits+=returned.units
    existing.grossReturns+=returned.amount
  }
  return {products,skippedNoSku,skippedNoDate}
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
  try{body=await req.json()}catch{return json(400,{error:'INVALID_JSON'},origin)}
  const connectionId=String(body?.connection_id||''),days=Number(body?.days||30)
  if(!validUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
  if(![7,30].includes(days))return json(400,{error:'INVALID_RANGE'},origin)
  const {data:connection,error:connectionError}=await userClient.from('marketplace_connections').select('id,marketplace,external_seller_id,status').eq('id',connectionId).maybeSingle()
  if(connectionError)return json(500,{error:'DB_ERROR'},origin)
  if(!connection||connection.marketplace!=='hepsiburada')return json(404,{error:'NOT_FOUND'},origin)
  const merchantId=String(connection.external_seller_id||'')
  if(!validUuid(merchantId))return json(400,{error:'INVALID_HEPSIBURADA_MERCHANT_ID'},origin)

  const lockToken=crypto.randomUUID(),{start,end}=rangeForDays(days),startDay=dayKey(start)!,endDay=dayKey(end)!
  let runId:string|null=null,lockHeld=false
  const safeFail=async(code:string,status='failed',cause?:unknown)=>{
    try{if(runId)await sql`update public.marketplace_sync_runs set status=${status},safe_error_code=${code},finished_at=now() where id=${runId}::uuid and user_id=${user.id}::uuid`}catch{}
    await captureSafeFailure('hepsiburada-sync',code,cause)
  }

  try{
    const locked=await sql`update public.marketplace_connections set sync_lock_token=${lockToken}::uuid,sync_lock_until=now()+interval '10 minutes' where id=${connectionId}::uuid and user_id=${user.id}::uuid and (sync_lock_until is null or sync_lock_until<now()) returning id`
    if(!locked.length)return json(409,{error:'SYNC_IN_PROGRESS'},origin)
    lockHeld=true
    const runRows=await sql`insert into public.marketplace_sync_runs(connection_id,user_id,range_start,range_end,status,worker_version) values(${connectionId}::uuid,${user.id}::uuid,to_timestamp(${start}/1000.0),to_timestamp(${end}/1000.0),'running','hepsiburada-finance-v1') returning id`
    runId=String(runRows[0].id)
    const usernameName=`kk.hepsiburada.${connectionId}.username`,passwordName=`kk.hepsiburada.${connectionId}.password`
    const secretRows=await sql`select name,decrypted_secret from vault.decrypted_secrets where name in (${usernameName},${passwordName})`
    const secrets=new Map(secretRows.map((row:any)=>[String(row.name),String(row.decrypted_secret||'')]))
    const username=secrets.get(usernameName)||'',password=secrets.get(passwordName)||''
    if(!username||!password){await safeFail('CREDENTIALS_MISSING');return json(409,{error:'CREDENTIALS_MISSING'},origin)}
    const authHeader=`Basic ${basic(`${username}:${password}`)}`,userAgent=`${merchantId} - Karkalkan`

    const transactions=await fetchAll('transactions',merchantId,start,end,authHeader,userAgent)
    const classified=classifyTransactions(transactions.rows)
    const performance=await fetchAll('orders',merchantId,start,end,authHeader,userAgent)
    const productAggregation=aggregateProducts(performance.rows,classified.returnsByProduct)

    const costRows=await sql<CostRow[]>`select external_product_id,cost_amount,valid_from::text,valid_to::text from public.marketplace_product_costs where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid order by external_product_id,valid_from desc`
    const costs=new Map<string,CostRow[]>()
    for(const row of costRows){const list=costs.get(String(row.external_product_id))||[];list.push(row);costs.set(String(row.external_product_id),list)}
    const now=new Date().toISOString()
    const productRows=[...productAggregation.products.values()].map(product=>{
      const netUnits=Math.max(0,product.salesUnits-product.returnUnits)
      const cost=activeCost(costs.get(product.sku),product.day)
      const knownCogs=cost===null?null:Math.round(cost*netUnits*100)/100
      const revenue=money(product.sellerRevenue),profit=knownCogs===null?null:Math.round((revenue-knownCogs)*100)/100
      const margin=profit===null||revenue===0?null:Math.round((profit/revenue*100)*100)/100
      return {
        connection_id:connectionId,user_id:user.id,day:product.day,external_product_id:product.sku,
        sku:product.sku,barcode:null,product_name:product.name,orders:product.orders.size,units:netUnits,
        sales_units:product.salesUnits,return_units:product.returnUnits,
        unit_basis:'hepsiburada_finance_performance_v1',sales_unit_basis:'hepsiburada_performance_quantity',
        return_unit_basis:'hepsiburada_transaction_return_proxy',order_line_matches:product.orders.size,
        return_proxy_matches:product.returnUnits,claim_item_matches:0,gross_sales:money(product.grossSales),
        gross_returns:money(product.grossReturns),commission_cost:money(product.commissionCost),
        seller_revenue:revenue,known_cogs:knownCogs,estimated_profit:profit,estimated_margin:margin,
        profit_confidence:knownCogs===null?'platform_only':'cost_known',updated_at:now
      }
    })
    const summary={
      provider:'hepsiburada',source:'official_finance_api',coverage:'hepsiburada_finance_v1',
      transactions:transactions.rows.length,transactionPages:transactions.pages,
      performanceRows:performance.rows.length,performancePages:performance.pages,
      days:classified.daily.size,productRows:productRows.length,unknownTransactionTypes:classified.unknownTypes,
      skippedTransactionsWithoutDate:classified.skippedNoDate,skippedZeroAmountTransactions:classified.skippedNoAmount,
      skippedPerformanceWithoutSku:productAggregation.skippedNoSku,skippedPerformanceWithoutDate:productAggregation.skippedNoDate,
      realStoreVerification:'pending_first_authorized_merchant'
    }

    await sql.begin(async tx=>{
      await tx`update public.marketplace_daily_financials set gross_sales=0,gross_returns=0,commission_cost=0,discount_cost=0,coupon_cost=0,provision_net=0,manual_refund_net=0,platform_promo_net=0,delivery_fee_net=0,correction_net=0,settlement_adjustment_net=0,platform_service_fee_cost=0,cargo_cost=0,stoppage_net=0,seller_revenue=0,transaction_count=0,settlement_coverage='hepsiburada_finance_v1',other_financial_coverage='hepsiburada_finance_v1',updated_at=now() where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`
      for(const [day,aggregate] of classified.daily){
        await tx`insert into public.marketplace_daily_financials(connection_id,user_id,day,currency,gross_sales,gross_returns,commission_cost,discount_cost,coupon_cost,provision_net,manual_refund_net,platform_promo_net,delivery_fee_net,correction_net,settlement_adjustment_net,platform_service_fee_cost,cargo_cost,stoppage_net,settlement_coverage,other_financial_coverage,seller_revenue,transaction_count,source_window_start,source_window_end) values(${connectionId}::uuid,${user.id}::uuid,${day}::date,'TRY',${money(aggregate.grossSales)},${money(aggregate.grossReturns)},${money(aggregate.commissionCost)},${money(aggregate.discountCost)},0,0,0,0,0,0,${money(aggregate.settlementAdjustmentNet)},${money(aggregate.platformServiceFeeCost)},${money(aggregate.cargoCost)},${money(aggregate.stoppageNet)},'hepsiburada_finance_v1','hepsiburada_finance_v1',${money(aggregate.sellerRevenue)},${aggregate.count},to_timestamp(${start}/1000.0),to_timestamp(${end}/1000.0)) on conflict (connection_id,day,currency) do update set gross_sales=excluded.gross_sales,gross_returns=excluded.gross_returns,commission_cost=excluded.commission_cost,discount_cost=excluded.discount_cost,coupon_cost=excluded.coupon_cost,provision_net=excluded.provision_net,manual_refund_net=excluded.manual_refund_net,platform_promo_net=excluded.platform_promo_net,delivery_fee_net=excluded.delivery_fee_net,correction_net=excluded.correction_net,settlement_adjustment_net=excluded.settlement_adjustment_net,platform_service_fee_cost=excluded.platform_service_fee_cost,cargo_cost=excluded.cargo_cost,stoppage_net=excluded.stoppage_net,settlement_coverage=excluded.settlement_coverage,other_financial_coverage=excluded.other_financial_coverage,seller_revenue=excluded.seller_revenue,transaction_count=excluded.transaction_count,source_window_start=excluded.source_window_start,source_window_end=excluded.source_window_end,updated_at=now()`
      }
      await tx`delete from public.marketplace_product_daily_metrics where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`
      for(let index=0;index<productRows.length;index+=INSERT_BATCH){
        const batch=productRows.slice(index,index+INSERT_BATCH)
        if(batch.length)await tx`insert into public.marketplace_product_daily_metrics ${tx(batch,'connection_id','user_id','day','external_product_id','sku','barcode','product_name','orders','units','sales_units','return_units','unit_basis','sales_unit_basis','return_unit_basis','order_line_matches','return_proxy_matches','claim_item_matches','gross_sales','gross_returns','commission_cost','seller_revenue','known_cogs','estimated_profit','estimated_margin','profit_confidence','updated_at')}`
      }
      await tx`update public.marketplace_sync_runs set status='success',imported_orders=${performance.rows.length},imported_transactions=${transactions.rows.length},finished_at=now(),result_summary=${JSON.stringify(summary)}::jsonb where id=${runId}::uuid and user_id=${user.id}::uuid`
      await tx`update public.marketplace_connections set status='connected',last_sync_at=now(),last_sync_status='success',updated_at=now() where id=${connectionId}::uuid and user_id=${user.id}::uuid`
    })
    return json(200,{ok:true,...summary,rangeDays:days,startDay,endDay,importedTransactions:transactions.rows.length,dailyRows:classified.daily.size},origin)
  }catch(error){
    const syncError=error instanceof SyncError?error:null
    const code=syncError?.code||'INTERNAL_ERROR'
    if(code==='HEPSIBURADA_UNAUTHORIZED'){
      try{await sql`update public.marketplace_connections set status='reauth_required',last_sync_status='failed',updated_at=now() where id=${connectionId}::uuid and user_id=${user.id}::uuid`}catch{}
    }
    await safeFail(code,code==='SYNC_TOO_LARGE'?'partial':'failed',error)
    console.error('hepsiburada-sync failed',code)
    return json(syncError?.httpStatus||500,{error:code,...(syncError?.upstreamStatus?{status:syncError.upstreamStatus}:{})},origin)
  }finally{
    if(lockHeld){try{await sql`update public.marketplace_connections set sync_lock_token=null,sync_lock_until=null where id=${connectionId}::uuid and user_id=${user.id}::uuid and sync_lock_token=${lockToken}::uuid`}catch{}}
  }
})
