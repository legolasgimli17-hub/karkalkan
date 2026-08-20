import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { createTransactionPool } from '../_shared/postgres.ts'
import { captureSafeFailure } from '../_shared/observability.ts'
import { consumeRateLimit, isUuid, readJsonBody, requestError } from '../_shared/request-security.ts'

const sql=createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL')||'',{max_lifetime:60})
const ECB_ORIGIN='https://data-api.ecb.europa.eu'
const MAX_ROWS=5000
const SUPPORTED=new Set(['EUR','USD','GBP','JPY','CHF','SEK','NOK','DKK','PLN','CZK','HUF','RON','TRY','AUD','CAD','NZD','CNY','HKD','SGD','KRW','INR','BRL','MXN','ZAR','ILS','THB','MYR','IDR','PHP','ISK'])

type InputRow={
  day:string;settlement_day?:string|null;currency?:string|null;external_product_id:string;sku?:string|null;product_name?:string|null;
  sales_units:number;return_units?:number;gross_sales:number;gross_returns?:number;commission_cost?:number;discount_cost?:number;coupon_cost?:number;seller_revenue?:number|null
}
type RateObservation={date:string;currency:string;unitsPerEur:number}
type FxRate={rateDate:string;rateToTry:number}

function clean(value:unknown,max:number){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)}
function date(value:unknown){const out=clean(value,10);return /^\d{4}-\d{2}-\d{2}$/.test(out)&&!Number.isNaN(Date.parse(`${out}T12:00:00Z`))?out:''}
function currency(value:unknown){const out=clean(value??'TRY',3).toUpperCase();return /^[A-Z]{3}$/.test(out)&&SUPPORTED.has(out)?out:''}
function amount(value:unknown,defaultValue:number|null=0){if(value===null||value===undefined||value==='')return defaultValue;const out=Number(value);return Number.isFinite(out)&&Math.abs(out)<=1_000_000_000?Math.round(out*100)/100:null}
function units(value:unknown,defaultValue:number|null=0){if(value===null||value===undefined||value==='')return defaultValue;const out=Number(value);return Number.isInteger(out)&&out>=0&&out<=10_000_000?out:null}
function round2(value:number){return Math.round((value+Number.EPSILON)*100)/100}
function addDays(day:string,delta:number){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
function csvRecords(text:string){const records:string[][]=[];let row:string[]=[],field='',quoted=false;for(let i=0;i<=text.length;i++){const c=i===text.length?'\n':text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted;continue}if(c===','&&!quoted){row.push(field);field='';continue}if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(value=>value!==''))records.push(row);row=[];continue}field+=c}if(quoted)throw new Error('ECB_BAD_CSV');return records}
function parseEcb(text:string){const records=csvRecords(text.replace(/^\uFEFF/,''));if(records.length<2)throw new Error('ECB_EMPTY');const headers=records[0].map(value=>value.trim().toUpperCase()),index=(name:string)=>headers.indexOf(name);const ci=index('CURRENCY'),di=index('TIME_PERIOD'),vi=index('OBS_VALUE');if(ci<0||di<0||vi<0)throw new Error('ECB_SCHEMA_CHANGED');const out:RateObservation[]=[];for(const record of records.slice(1)){const cur=clean(record[ci],3).toUpperCase(),day=date(record[di]),rate=Number(record[vi]);if(SUPPORTED.has(cur)&&day&&Number.isFinite(rate)&&rate>0)out.push({date:day,currency:cur,unitsPerEur:rate})}return out}
async function ecbObservations(currencies:Set<string>,minDay:string,maxDay:string){
  const remote=[...currencies].filter(cur=>cur!=='EUR').sort();if(!remote.length)return [] as RateObservation[]
  const series=`D.${remote.join('+')}.EUR.SP00.A`,url=new URL(`/service/data/EXR/${series}`,ECB_ORIGIN);url.searchParams.set('startPeriod',addDays(minDay,-8));url.searchParams.set('endPeriod',maxDay);url.searchParams.set('format','csvdata');url.searchParams.set('detail','dataonly')
  let response:Response;try{response=await fetch(url,{headers:{Accept:'text/csv','User-Agent':'Karkalkan/1.0 FX Reference Import'},redirect:'error',signal:AbortSignal.timeout(20_000)})}catch{throw new Error('ECB_NETWORK')}
  if(!response.ok)throw new Error(`ECB_HTTP_${response.status}`)
  return parseEcb(await response.text())
}
function makeResolver(observations:RateObservation[]){
  const byCurrency=new Map<string,RateObservation[]>();for(const obs of observations){const list=byCurrency.get(obs.currency)||[];list.push(obs);byCurrency.set(obs.currency,list)}for(const list of byCurrency.values())list.sort((a,b)=>a.date.localeCompare(b.date))
  const units=(cur:string,target:string)=>{if(cur==='EUR')return {date:target,value:1};const list=byCurrency.get(cur)||[];let match:RateObservation|undefined;for(const obs of list){if(obs.date>target)break;match=obs}if(!match)throw new Error(`FX_RATE_MISSING_${cur}_${target}`);return {date:match.date,value:match.unitsPerEur}}
  return (cur:string,target:string):FxRate=>{if(cur==='TRY')return {rateDate:target,rateToTry:1};const src=units(cur,target),tryRate=units('TRY',target);return {rateDate:src.date<tryRate.date?src.date:tryRate.date,rateToTry:tryRate.value/src.value}}
}
async function callCore(req:Request,body:unknown){
  const projectUrl=Deno.env.get('SUPABASE_URL')||'',publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default,authorization=req.headers.get('Authorization')||'';if(!projectUrl||!publishable||!authorization)throw new Error('SERVER_CONFIG')
  const response=await fetch(`${projectUrl}/functions/v1/marketplace-import`,{method:'POST',headers:{apikey:publishable,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45_000)});let payload:any={};try{payload=await response.json()}catch{}if(!response.ok){const error=new Error(String(payload?.error||`IMPORT_HTTP_${response.status}`));(error as any).status=response.status;throw error}return payload
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin');if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)});if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  let auth;try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}if(!auth)return json(401,{error:'UNAUTHORIZED'},origin);if(!sql)return json(503,{error:'SERVER_MISCONFIGURED'},origin)
  try{if(!(await consumeRateLimit(sql,'marketplace-import-fx',auth.user.id,10,3600)))return json(429,{error:'RATE_LIMITED'},origin)}catch{return json(500,{error:'RATE_LIMIT_FAILED'},origin)}
  let body:any;try{body=await readJsonBody(req,3_000_000)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}
  if(Object.keys(body||{}).sort().join(',')!=='connection_id,rows')return json(400,{error:'INVALID_PAYLOAD'},origin)
  const connectionId=String(body.connection_id||''),rawRows=Array.isArray(body.rows)?body.rows:[];if(!isUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin);if(!rawRows.length||rawRows.length>MAX_ROWS)return json(400,{error:'INVALID_IMPORT_SIZE',maxRows:MAX_ROWS},origin)
  const {data:connection,error:connectionError}=await auth.userClient.from('marketplace_connections').select('id').eq('id',connectionId).maybeSingle();if(connectionError)return json(500,{error:'DB_ERROR'},origin);if(!connection)return json(404,{error:'NOT_FOUND'},origin)

  const rows:Array<InputRow&{currency:string;day:string;settlement_day:string|null}>=[];const currencies=new Set<string>(['TRY']);let minDay='9999-12-31',maxDay='0001-01-01'
  for(let index=0;index<rawRows.length;index++){
    const source=rawRows[index]||{},day=date(source.day),settlement=source.settlement_day?date(source.settlement_day):'',cur=currency(source.currency),product=clean(source.external_product_id,180),sales=units(source.sales_units,null),returns=units(source.return_units,0),gross=amount(source.gross_sales,null)
    const grossReturns=amount(source.gross_returns,0),commission=amount(source.commission_cost,0),discount=amount(source.discount_cost,0),coupon=amount(source.coupon_cost,0),sellerRevenue=amount(source.seller_revenue,null)
    if(!day||!cur||!product||sales===null||returns===null||gross===null||grossReturns===null||commission===null||discount===null||coupon===null)return json(400,{error:'INVALID_FX_IMPORT_ROW',row:index+2},origin)
    if([gross,grossReturns,commission,discount,coupon].some(value=>value<0))return json(400,{error:'NEGATIVE_IMPORT_VALUE',row:index+2},origin)
    if(source.settlement_day&&!settlement)return json(400,{error:'INVALID_SETTLEMENT_DAY',row:index+2},origin)
    if(settlement&&(settlement<day||settlement>addDays(day,370)))return json(400,{error:'INVALID_SETTLEMENT_DAY',row:index+2},origin)
    const normalized={...source,day,settlement_day:settlement||null,currency:cur,external_product_id:product,sales_units:sales,return_units:returns,gross_sales:gross,gross_returns:grossReturns,commission_cost:commission,discount_cost:discount,coupon_cost:coupon,...(sellerRevenue===null?{}:{seller_revenue:sellerRevenue})}
    rows.push(normalized);currencies.add(cur);if(day<minDay)minDay=day;if(day>maxDay)maxDay=day;if(settlement){if(settlement<minDay)minDay=settlement;if(settlement>maxDay)maxDay=settlement}
  }

  let observations:RateObservation[]=[];try{observations=await ecbObservations(currencies,minDay,maxDay)}catch(error){const code=clean((error as Error).message,120)||'ECB_FAILED';await captureSafeFailure('marketplace-import-fx',code,error);return json(code.startsWith('ECB_HTTP_')?502:503,{error:code},origin)}
  try{if(observations.length)for(let index=0;index<observations.length;index+=500){const batch=observations.slice(index,index+500).map(obs=>({rate_date:obs.date,currency:obs.currency,units_per_eur:obs.unitsPerEur,source:'ecb_reference',retrieved_at:new Date().toISOString()}));await sql`insert into public.fx_rates_daily ${sql(batch,'rate_date','currency','units_per_eur','source','retrieved_at')} on conflict (rate_date,currency) do update set units_per_eur=excluded.units_per_eur,retrieved_at=excluded.retrieved_at`}}catch(error){await captureSafeFailure('marketplace-import-fx','FX_CACHE_WRITE_FAILED',error);return json(500,{error:'FX_CACHE_WRITE_FAILED'},origin)}

  const rate=makeResolver(observations),converted:any[]=[],groups=new Map<string,any>();let totalVariance=0
  try{
    for(const row of rows){const transactionRate=rate(row.currency,row.day),settlementRate=row.settlement_day?rate(row.currency,row.settlement_day):null,convert=(value:number)=>round2(value*transactionRate.rateToTry);const originalNet=row.seller_revenue??round2(row.gross_sales-row.gross_returns-row.commission_cost-row.discount_cost-row.coupon_cost),variance=settlementRate?round2(originalNet*(settlementRate.rateToTry-transactionRate.rateToTry)):0;totalVariance=round2(totalVariance+variance)
      converted.push({day:row.day,external_product_id:row.external_product_id,sku:row.sku??null,product_name:row.product_name??null,sales_units:row.sales_units,return_units:row.return_units,gross_sales:convert(row.gross_sales),gross_returns:convert(row.gross_returns),commission_cost:convert(row.commission_cost),discount_cost:convert(row.discount_cost),coupon_cost:convert(row.coupon_cost),...(row.seller_revenue===undefined?{}:{seller_revenue:convert(Number(row.seller_revenue))})})
      const key=`${row.day}\u0000${row.currency}\u0000${row.settlement_day||''}`,current=groups.get(key)||{day:row.day,settlement_day:row.settlement_day,original_currency:row.currency,transaction_rate_date:transactionRate.rateDate,transaction_rate_to_try:transactionRate.rateToTry,settlement_rate_date:settlementRate?.rateDate||null,settlement_rate_to_try:settlementRate?.rateToTry||null,original_gross_sales:0,original_gross_returns:0,original_commission_cost:0,original_discount_cost:0,original_coupon_cost:0,original_seller_revenue:0,converted_gross_sales_try:0,converted_gross_returns_try:0,converted_commission_cost_try:0,converted_discount_cost_try:0,converted_coupon_cost_try:0,converted_seller_revenue_try:0,fx_reference_variance_try:0,row_count:0,sellerRevenueKnown:true}
      current.original_gross_sales+=row.gross_sales;current.original_gross_returns+=row.gross_returns;current.original_commission_cost+=row.commission_cost;current.original_discount_cost+=row.discount_cost;current.original_coupon_cost+=row.coupon_cost;current.original_seller_revenue+=originalNet;current.converted_gross_sales_try+=convert(row.gross_sales);current.converted_gross_returns_try+=convert(row.gross_returns);current.converted_commission_cost_try+=convert(row.commission_cost);current.converted_discount_cost_try+=convert(row.discount_cost);current.converted_coupon_cost_try+=convert(row.coupon_cost);current.converted_seller_revenue_try+=convert(originalNet);current.fx_reference_variance_try+=variance;current.row_count++;groups.set(key,current)
    }
  }catch(error){const code=clean((error as Error).message,140)||'FX_RATE_MISSING';return json(409,{error:code},origin)}

  const batchId=crypto.randomUUID(),sourceCurrencies=[...new Set(rows.map(row=>row.currency))].sort()
  try{
    await sql.begin(async tx=>{
      await tx`insert into public.marketplace_fx_import_batches(id,user_id,connection_id,status,row_count,source_currencies,fx_reference_variance_try) values(${batchId}::uuid,${auth.user.id}::uuid,${connectionId}::uuid,'pending',${rows.length},${sourceCurrencies},${totalVariance})`
      const details=[...groups.values()].map(group=>({batch_id:batchId,user_id:auth.user.id,connection_id:connectionId,base_currency:'TRY',...group,original_gross_sales:round2(group.original_gross_sales),original_gross_returns:round2(group.original_gross_returns),original_commission_cost:round2(group.original_commission_cost),original_discount_cost:round2(group.original_discount_cost),original_coupon_cost:round2(group.original_coupon_cost),original_seller_revenue:round2(group.original_seller_revenue),converted_gross_sales_try:round2(group.converted_gross_sales_try),converted_gross_returns_try:round2(group.converted_gross_returns_try),converted_commission_cost_try:round2(group.converted_commission_cost_try),converted_discount_cost_try:round2(group.converted_discount_cost_try),converted_coupon_cost_try:round2(group.converted_coupon_cost_try),converted_seller_revenue_try:round2(group.converted_seller_revenue_try),fx_reference_variance_try:round2(group.fx_reference_variance_try)}))
      if(details.length)await tx`insert into public.marketplace_fx_import_daily ${tx(details,'batch_id','user_id','connection_id','day','settlement_day','original_currency','base_currency','transaction_rate_date','transaction_rate_to_try','settlement_rate_date','settlement_rate_to_try','original_gross_sales','original_gross_returns','original_commission_cost','original_discount_cost','original_coupon_cost','original_seller_revenue','converted_gross_sales_try','converted_gross_returns_try','converted_commission_cost_try','converted_discount_cost_try','converted_coupon_cost_try','converted_seller_revenue_try','fx_reference_variance_try','row_count')}`
    })
  }catch(error){await captureSafeFailure('marketplace-import-fx','FX_EVIDENCE_WRITE_FAILED',error);return json(500,{error:'FX_EVIDENCE_WRITE_FAILED'},origin)}

  try{const result=await callCore(req,{connection_id:connectionId,rows:converted});await sql`update public.marketplace_fx_import_batches set status='success',completed_at=now() where id=${batchId}::uuid and user_id=${auth.user.id}::uuid`;return json(200,{...result,fx:{baseCurrency:'TRY',source:'ECB_REFERENCE',sourceCurrencies,fxReferenceVarianceTry:totalVariance,evidenceStored:true,referenceOnly:true}},origin)}catch(error){const code=clean((error as Error).message,120)||'IMPORT_FAILED';try{await sql`update public.marketplace_fx_import_batches set status='failed',safe_error_code=${code},completed_at=now() where id=${batchId}::uuid and user_id=${auth.user.id}::uuid`}catch{}await captureSafeFailure('marketplace-import-fx',code,error);return json(Number((error as any).status)||500,{error:code},origin)}
})
