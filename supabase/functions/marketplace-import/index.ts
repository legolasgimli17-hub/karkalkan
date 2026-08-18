import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { createTransactionPool } from '../_shared/postgres.ts'
import { allowedOrigin, json, responseHeaders } from '../_shared/edge-auth.ts'
import { captureSafeFailure } from '../_shared/observability.ts'

type ImportRow={day:string;external_product_id:string;sku:string|null;product_name:string|null;sales_units:number;return_units:number;gross_sales:number;gross_returns:number;commission_cost:number;discount_cost:number;coupon_cost:number;seller_revenue:number}
type ProductAgg=ImportRow&{orders:number}
type DailyAgg={gross_sales:number;gross_returns:number;commission_cost:number;discount_cost:number;coupon_cost:number;seller_revenue:number;transaction_count:number}
type CostRow={external_product_id:string;cost_amount:number;valid_from:string;valid_to:string|null}

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const sql=createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL')||'',{max_lifetime:60})
const MAX_ROWS=5000
function uuid(value:string){return /^[0-9a-f-]{36}$/i.test(value)}
function date(value:unknown){const result=String(value||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(result)&&!Number.isNaN(Date.parse(`${result}T12:00:00Z`))?result:''}
function text(value:unknown,max:number){const result=String(value??'').trim();return result&&result.length<=max?result:''}
function amount(value:unknown){const result=Number(value);return Number.isFinite(result)&&Math.abs(result)<=1_000_000_000?Math.round(result*100)/100:null}
function units(value:unknown){const result=Number(value??0);return Number.isInteger(result)&&result>=0&&result<=10_000_000?result:null}
function activeCost(rows:CostRow[]|undefined,day:string){for(const row of rows||[])if(row.valid_from<=day&&(!row.valid_to||row.valid_to>=day))return Number(row.cost_amount);return null}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  const auth=req.headers.get('Authorization')||''
  const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default
  if(!auth.startsWith('Bearer ')||!PROJECT_URL||!publishable||!sql)return json(503,{error:'SERVER_CONFIG'},origin)
  const userClient=createClient(PROJECT_URL,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
  const {data:userData,error:userError}=await userClient.auth.getUser(auth.slice(7)),user=userData?.user
  if(userError||!user)return json(401,{error:'UNAUTHORIZED'},origin)
  let body:any
  try{body=await req.json()}catch{return json(400,{error:'INVALID_JSON'},origin)}
  const connectionId=String(body?.connection_id||''),sourceRows=Array.isArray(body?.rows)?body.rows:[]
  if(!uuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
  if(!sourceRows.length||sourceRows.length>MAX_ROWS)return json(400,{error:'INVALID_IMPORT_SIZE',maxRows:MAX_ROWS},origin)
  const {data:connection}=await userClient.from('marketplace_connections').select('id,marketplace').eq('id',connectionId).maybeSingle()
  if(!connection)return json(404,{error:'NOT_FOUND'},origin)
  const rows:ImportRow[]=[]
  for(let index=0;index<sourceRows.length;index++){
    const source=sourceRows[index]||{},day=date(source.day),productId=text(source.external_product_id,180),salesUnits=units(source.sales_units),returnUnits=units(source.return_units)
    const grossSales=amount(source.gross_sales),grossReturns=amount(source.gross_returns??0),commission=amount(source.commission_cost??0),discount=amount(source.discount_cost??0),coupon=amount(source.coupon_cost??0)
    if(!day||!productId||salesUnits===null||returnUnits===null||grossSales===null||grossReturns===null||commission===null||discount===null||coupon===null)return json(400,{error:'INVALID_IMPORT_ROW',row:index+2},origin)
    if([grossSales,grossReturns,commission,discount,coupon].some(value=>value<0))return json(400,{error:'NEGATIVE_IMPORT_VALUE',row:index+2},origin)
    const calculated=Math.round((grossSales-grossReturns-commission-discount-coupon)*100)/100,sellerRevenue=source.seller_revenue==null?calculated:amount(source.seller_revenue)
    if(sellerRevenue===null)return json(400,{error:'INVALID_IMPORT_ROW',row:index+2},origin)
    rows.push({day,external_product_id:productId,sku:text(source.sku,180)||null,product_name:text(source.product_name,300)||null,sales_units:salesUnits,return_units:returnUnits,gross_sales:grossSales,gross_returns:grossReturns,commission_cost:commission,discount_cost:discount,coupon_cost:coupon,seller_revenue:sellerRevenue})
  }
  const startDay=rows.map(row=>row.day).sort()[0],endDay=rows.map(row=>row.day).sort().at(-1) as string
  const daily=new Map<string,DailyAgg>(),products=new Map<string,ProductAgg>()
  for(const row of rows){
    const d=daily.get(row.day)||{gross_sales:0,gross_returns:0,commission_cost:0,discount_cost:0,coupon_cost:0,seller_revenue:0,transaction_count:0}
    d.gross_sales+=row.gross_sales;d.gross_returns+=row.gross_returns;d.commission_cost+=row.commission_cost;d.discount_cost+=row.discount_cost;d.coupon_cost+=row.coupon_cost;d.seller_revenue+=row.seller_revenue;d.transaction_count++
    daily.set(row.day,d)
    const key=`${row.day}\u0000${row.external_product_id}`,p=products.get(key)||{...row,orders:0,sales_units:0,return_units:0,gross_sales:0,gross_returns:0,commission_cost:0,discount_cost:0,coupon_cost:0,seller_revenue:0}
    p.orders++;p.sales_units+=row.sales_units;p.return_units+=row.return_units;p.gross_sales+=row.gross_sales;p.gross_returns+=row.gross_returns;p.commission_cost+=row.commission_cost;p.discount_cost+=row.discount_cost;p.coupon_cost+=row.coupon_cost;p.seller_revenue+=row.seller_revenue;if(!p.sku)p.sku=row.sku;if(!p.product_name)p.product_name=row.product_name
    products.set(key,p)
  }
  try{
    const costRows=await sql<CostRow[]>`select external_product_id,cost_amount,valid_from::text,valid_to::text from public.marketplace_product_costs where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and valid_from<=${endDay}::date and (valid_to is null or valid_to>=${startDay}::date) order by external_product_id,valid_from desc`
    const costs=new Map<string,CostRow[]>()
    for(const row of costRows){const list=costs.get(String(row.external_product_id))||[];list.push(row);costs.set(String(row.external_product_id),list)}
    const productRows=[...products.values()].map(row=>{const netUnits=row.sales_units-row.return_units,cost=activeCost(costs.get(row.external_product_id),row.day),known=cost===null?null:Math.round(cost*netUnits*100)/100,profit=known===null?null:Math.round((row.seller_revenue-known)*100)/100,margin=profit===null||row.seller_revenue===0?null:Math.round((profit/row.seller_revenue*100)*100)/100;return {connection_id:connectionId,user_id:user.id,day:row.day,external_product_id:row.external_product_id,sku:row.sku,barcode:row.external_product_id,product_name:row.product_name,orders:row.orders,units:netUnits,sales_units:row.sales_units,return_units:row.return_units,unit_basis:'settlement_transaction_proxy',sales_unit_basis:'settlement_transaction_proxy',return_unit_basis:'settlement_transaction_proxy',gross_sales:row.gross_sales,gross_returns:row.gross_returns,commission_cost:row.commission_cost,seller_revenue:row.seller_revenue,known_cogs:known,estimated_profit:profit,estimated_margin:margin,profit_confidence:known===null?'platform_only':'cost_known',updated_at:new Date().toISOString()}})
    const runId=crypto.randomUUID(),rangeStart=`${startDay}T00:00:00+03:00`,rangeEnd=`${endDay}T23:59:59+03:00`
    await sql.begin(async tx=>{
      await tx`insert into public.marketplace_sync_runs(id,connection_id,user_id,range_start,range_end,status,imported_orders,imported_transactions,result_summary) values(${runId}::uuid,${connectionId}::uuid,${user.id}::uuid,${rangeStart}::timestamptz,${rangeEnd}::timestamptz,'running',${rows.length},0,${JSON.stringify({source:'normalized_csv',marketplace:connection.marketplace})}::jsonb)`
      await tx`delete from public.marketplace_product_daily_metrics where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`
      await tx`delete from public.marketplace_daily_financials where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`
      for(const [day,row] of daily){await tx`insert into public.marketplace_daily_financials(connection_id,user_id,day,currency,gross_sales,gross_returns,commission_cost,discount_cost,coupon_cost,provision_net,seller_revenue,transaction_count,source_window_start,source_window_end) values(${connectionId}::uuid,${user.id}::uuid,${day}::date,'TRY',${row.gross_sales},${row.gross_returns},${row.commission_cost},${row.discount_cost},${row.coupon_cost},${row.seller_revenue},${row.seller_revenue},${row.transaction_count},${rangeStart}::timestamptz,${rangeEnd}::timestamptz)`}
      for(let index=0;index<productRows.length;index+=250){const batch=productRows.slice(index,index+250);if(batch.length)await tx`insert into public.marketplace_product_daily_metrics ${tx(batch,'connection_id','user_id','day','external_product_id','sku','barcode','product_name','orders','units','sales_units','return_units','unit_basis','sales_unit_basis','return_unit_basis','gross_sales','gross_returns','commission_cost','seller_revenue','known_cogs','estimated_profit','estimated_margin','profit_confidence','updated_at')}`}
      await tx`update public.marketplace_sync_runs set status='success',imported_transactions=${rows.length},finished_at=now(),result_summary=result_summary||${JSON.stringify({rows:rows.length,days:daily.size,products:productRows.length})}::jsonb where id=${runId}::uuid`
      await tx`update public.marketplace_connections set status='connected',capability_tier=case when marketplace in ('amazon','flo') then 'import' else capability_tier end,last_sync_at=now(),last_sync_status='success',updated_at=now() where id=${connectionId}::uuid and user_id=${user.id}::uuid`
    })
    return json(200,{ok:true,source:'normalized_csv',marketplace:connection.marketplace,rows:rows.length,days:daily.size,products:productRows.length,startDay,endDay},origin)
  }catch(error){await captureSafeFailure('marketplace-import','IMPORT_FAILED',error);return json(500,{error:'IMPORT_FAILED'},origin)}
})
