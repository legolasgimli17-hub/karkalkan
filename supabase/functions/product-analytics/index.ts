import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { createTransactionPool } from '../_shared/postgres.ts'
import { consumeRateLimit, readJsonBody, requestError } from '../_shared/request-security.ts'

const sql=createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL')||'',{max_lifetime:60})
const EVENT_NAMES=new Set(['onboarding_stage_viewed','onboarding_completed','onboarding_next_clicked','onboarding_step_clicked'])
const STAGES=new Set(['none','store','data','cost','decision','complete'])
const TARGET_STEPS=new Set(['none','store','data','cost','decision'])
const ALLOWED_KEYS=new Set(['event_name','stage','completed_steps','target_step'])

function cleanEnum(value:unknown,allowed:Set<string>,fallback='none'){
  const normalized=String(value??fallback).trim().toLowerCase()
  return allowed.has(normalized)?normalized:''
}

function validEventShape(eventName:string,stage:string,completedSteps:number,targetStep:string){
  if(eventName==='onboarding_stage_viewed')return stage!=='none'&&targetStep==='none'
  if(eventName==='onboarding_completed')return stage==='complete'&&completedSteps===4&&targetStep==='none'
  if(eventName==='onboarding_next_clicked')return stage!=='none'&&targetStep==='none'
  if(eventName==='onboarding_step_clicked')return targetStep!=='none'
  return false
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)

  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)
  if(!sql)return json(503,{error:'SERVER_MISCONFIGURED'},origin)

  let body:Record<string,unknown>
  try{body=await readJsonBody(req,2_048) as Record<string,unknown>}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}
  if(!body||Array.isArray(body)||Object.keys(body).some(key=>!ALLOWED_KEYS.has(key)))return json(400,{error:'INVALID_ANALYTICS_EVENT'},origin)

  const eventName=cleanEnum(body.event_name,EVENT_NAMES,'')
  const stage=cleanEnum(body.stage,STAGES)
  const targetStep=cleanEnum(body.target_step,TARGET_STEPS)
  const completedSteps=Number(body.completed_steps)
  if(!eventName||!stage||!targetStep||!Number.isInteger(completedSteps)||completedSteps<0||completedSteps>4||!validEventShape(eventName,stage,completedSteps,targetStep))return json(400,{error:'INVALID_ANALYTICS_EVENT'},origin)

  try{
    const allowed=await consumeRateLimit(sql,'product-analytics',auth.user.id,120,3600)
    if(!allowed)return json(429,{error:'RATE_LIMITED'},origin)
    await sql`
      insert into public.product_analytics_daily
        (day,event_name,stage,completed_steps,target_step,event_count,updated_at)
      values
        ((now() at time zone 'UTC')::date,${eventName},${stage},${completedSteps},${targetStep},1,now())
      on conflict (day,event_name,stage,completed_steps,target_step)
      do update set
        event_count=public.product_analytics_daily.event_count+1,
        updated_at=now()
    `
    return json(200,{recorded:true},origin)
  }catch{
    return json(500,{error:'ANALYTICS_WRITE_FAILED'},origin)
  }
})
