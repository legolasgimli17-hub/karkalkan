import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { readJsonBody, requestError, isUuid } from '../_shared/request-security.ts'

const FIELDS=['gross_sales','gross_returns','commission_cost','discount_cost','coupon_cost','seller_revenue','platform_service_fee_cost','stoppage_net','cargo_cost'] as const
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'})

function dayKey(value:Date){const parts=dayFormatter.formatToParts(value),get=(type:string)=>parts.find(part=>part.type===type)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`}
function parseDay(value:unknown){const text=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;const date=new Date(`${text}T12:00:00Z`);return Number.isNaN(date.getTime())?null:{text,date}}
function money(value:unknown){const number=Number(value);if(!Number.isFinite(number)||Math.abs(number)>1_000_000_000_000)return null;return Math.round(number*100)/100}
function add(acc:Record<string,number>,row:any){for(const key of FIELDS)acc[key]=Math.round((acc[key]+(Number(row?.[key])||0))*100)/100}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)

  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)

  let body:any
  try{body=await readJsonBody(req,16*1024)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}
  const keys=Object.keys(body||{}).sort().join(',')
  if(keys!=='connection_id,period_end,period_start,source_totals')return json(400,{error:'INVALID_RECONCILIATION_PAYLOAD'},origin)
  const connectionId=String(body.connection_id||'')
  if(!isUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
  const start=parseDay(body.period_start),end=parseDay(body.period_end)
  if(!start||!end)return json(400,{error:'INVALID_PERIOD'},origin)
  const span=Math.round((end.date.getTime()-start.date.getTime())/86_400_000)+1
  if(span!==7||end.text>=dayKey(new Date()))return json(400,{error:'VALIDATION_PERIOD_MUST_BE_CLOSED_7_DAYS'},origin)

  const source=body.source_totals
  if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).sort().join(',')!==[...FIELDS].sort().join(','))return json(400,{error:'INVALID_SOURCE_TOTALS'},origin)
  const sourceTotals:Record<string,number>={}
  for(const field of FIELDS){const value=money(source[field]);if(value===null)return json(400,{error:'INVALID_SOURCE_TOTALS',field},origin);sourceTotals[field]=value}

  const {data:connection,error:connectionError}=await auth.admin.from('marketplace_connections').select('id,marketplace,status,last_sync_status').eq('id',connectionId).eq('user_id',auth.user.id).maybeSingle()
  if(connectionError)return json(500,{error:'DB_READ_FAILED'},origin)
  if(!connection||connection.marketplace!=='trendyol')return json(404,{error:'NOT_FOUND'},origin)

  const [{data:daily,error:dailyError},{data:runs,error:runError}]=await Promise.all([
    auth.admin.from('marketplace_daily_financials').select('day,gross_sales,gross_returns,commission_cost,discount_cost,coupon_cost,seller_revenue,platform_service_fee_cost,stoppage_net,cargo_cost').eq('user_id',auth.user.id).eq('connection_id',connectionId).gte('day',start.text).lte('day',end.text).order('day',{ascending:true}),
    auth.admin.from('marketplace_sync_runs').select('range_start,range_end,status').eq('user_id',auth.user.id).eq('connection_id',connectionId).eq('status','success').order('finished_at',{ascending:false}).limit(30)
  ])
  if(dailyError||runError)return json(500,{error:'DB_READ_FAILED'},origin)
  if(!(daily||[]).length)return json(409,{error:'VALIDATION_DATA_MISSING'},origin)

  const startMs=new Date(`${start.text}T00:00:00+03:00`).getTime(),endMs=new Date(`${end.text}T23:59:59.999+03:00`).getTime()
  const coreSyncEvidence=(runs||[]).some((run:any)=>new Date(run.range_start).getTime()<=startMs&&new Date(run.range_end).getTime()>=endMs)
  if(!coreSyncEvidence)return json(409,{error:'VALIDATION_SYNC_EVIDENCE_MISSING'},origin)

  const karkalkanTotals=Object.fromEntries(FIELDS.map(field=>[field,0])) as Record<string,number>
  for(const row of daily||[])add(karkalkanTotals,row)
  const deltas:Record<string,number>={}
  let matched=true
  for(const field of FIELDS){deltas[field]=Math.round((karkalkanTotals[field]-sourceTotals[field])*100)/100;if(Math.abs(deltas[field])>0.01)matched=false}
  const status=matched?'matched':'review_required'
  const summary={version:1,method:'closed_7_day_aggregate_reconciliation',source_totals:sourceTotals,karkalkan_totals:karkalkanTotals,deltas,core_sync_evidence:true,daily_rows:(daily||[]).length}

  const {error:writeError}=await auth.admin.from('marketplace_validation_evidence').upsert({
    user_id:auth.user.id,connection_id:connectionId,marketplace:'trendyol',period_start:start.text,period_end:end.text,status,evidence_summary:summary,updated_at:new Date().toISOString()
  },{onConflict:'user_id,connection_id,period_start,period_end'})
  if(writeError)return json(500,{error:'VALIDATION_EVIDENCE_WRITE_FAILED'},origin)
  return json(200,{status,period:{start:start.text,end:end.text},karkalkanTotals,sourceTotals,deltas,matched},origin)
})
