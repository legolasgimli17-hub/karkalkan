import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { paddleConfig, isPlanKey } from '../_shared/billing.ts'
import { captureSafeFailure } from '../_shared/observability.ts'
import { readTextBody, requestError } from '../_shared/request-security.ts'

const encoder=new TextEncoder()
const MAX_BODY_BYTES=1_000_000
function plainJson(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff'}})}
function bytesToHex(bytes:ArrayBuffer){return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('')}
function timingSafeHexEqual(left:string,right:string){if(left.length!==right.length)return false;let diff=0;for(let index=0;index<left.length;index++)diff|=left.charCodeAt(index)^right.charCodeAt(index);return diff===0}
async function hmacHex(secret:string,message:string){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return bytesToHex(await crypto.subtle.sign('HMAC',key,encoder.encode(message)))}
async function sha256Hex(message:string){return bytesToHex(await crypto.subtle.digest('SHA-256',encoder.encode(message)))}
function parseSignature(value:string){let ts='';const signatures:string[]=[];if(value.length>4096)return {ts,signatures};for(const part of value.split(';').slice(0,16)){const [key,entry]=part.split('=',2);if(key==='ts'&&/^\d{1,12}$/.test(entry||''))ts=entry||'';if(key==='h1'&&/^[a-f0-9]{64}$/i.test(entry||'')&&signatures.length<8)signatures.push(String(entry).toLowerCase())}return {ts,signatures}}
function validUuid(value:unknown){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return plainJson(405,{error:'METHOD_NOT_ALLOWED'})
  const config=paddleConfig()
  const projectUrl=Deno.env.get('SUPABASE_URL')||''
  const secretKey=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default
  if(!config.webhookSecret||!projectUrl||!secretKey)return plainJson(503,{error:'SERVER_CONFIG'})
  let raw=''
  try{raw=await readTextBody(req,MAX_BODY_BYTES,true)}catch(error){const failure=requestError(error);return plainJson(failure.status,{error:failure.code})}
  const parsedSignature=parseSignature(req.headers.get('Paddle-Signature')||'')
  const timestamp=Number(parsedSignature.ts)
  if(!Number.isFinite(timestamp)||Math.abs(Math.floor(Date.now()/1000)-timestamp)>config.webhookToleranceSeconds||!parsedSignature.signatures.length)return plainJson(401,{error:'INVALID_SIGNATURE'})
  const expected=await hmacHex(config.webhookSecret,`${parsedSignature.ts}:${raw}`)
  if(!parsedSignature.signatures.some(signature=>timingSafeHexEqual(expected,signature)))return plainJson(401,{error:'INVALID_SIGNATURE'})
  let event:any
  try{event=JSON.parse(raw)}catch{return plainJson(400,{error:'INVALID_JSON'})}
  const eventId=String(event?.event_id||'').slice(0,100),eventType=String(event?.event_type||'').slice(0,100)
  if(!eventId||!eventType)return plainJson(400,{error:'INVALID_EVENT'})
  const admin=createClient(projectUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const payloadHash=await sha256Hex(raw)
  const {data:existing}=await admin.from('billing_events').select('safe_error_code,payload_sha256').eq('paddle_event_id',eventId).maybeSingle()
  if(existing&&!timingSafeHexEqual(String(existing.payload_sha256||''),payloadHash)){
    await captureSafeFailure('billing-webhook','EVENT_ID_CONFLICT')
    return plainJson(409,{error:'EVENT_ID_CONFLICT'})
  }
  if(existing&&!existing.safe_error_code)return plainJson(200,{received:true,duplicate:true})
  const occurredAt=event?.occurred_at&&Number.isFinite(Date.parse(String(event.occurred_at)))?new Date(String(event.occurred_at)).toISOString():null
  const eventRow={paddle_event_id:eventId,event_type:eventType,payload_sha256:payloadHash,occurred_at:occurredAt,safe_error_code:'PROCESSING'}
  if(!existing){const {error:insertError}=await admin.from('billing_events').insert(eventRow);if(insertError&&insertError.code!=='23505')return plainJson(500,{error:'EVENT_LEDGER_FAILED'})}

  try{
    const data=event?.data||{},customerId=String(data?.customer_id||'')
    let userId=validUuid(data?.custom_data?.user_id)?String(data.custom_data.user_id):''
    if(!userId&&/^ctm_[a-z0-9]{26}$/.test(customerId)){
      const {data:customer}=await admin.from('billing_customers').select('user_id').eq('paddle_customer_id',customerId).maybeSingle()
      if(customer?.user_id)userId=String(customer.user_id)
    }
    if(userId&&/^ctm_[a-z0-9]{26}$/.test(customerId)){
      const {error}=await admin.from('billing_customers').upsert({user_id:userId,paddle_customer_id:customerId,updated_at:new Date().toISOString()},{onConflict:'user_id'})
      if(error)throw new Error('CUSTOMER_WRITE_FAILED')
    }
    if(eventType.startsWith('subscription.')&&userId){
      const priceId=String(data?.items?.[0]?.price?.id||data?.items?.[0]?.price_id||'')
      const reversePlan=Object.entries(config.prices).find(([,configuredPrice])=>configuredPrice&&configuredPrice===priceId)?.[0]||''
      // The configured Paddle price is authoritative. Customer-controlled or
      // stale custom data must never upgrade an account to a more expensive tier.
      const planKey=isPlanKey(reversePlan)?reversePlan:'free'
      const allowedStatus=['trialing','active','past_due','paused','canceled']
      const status=allowedStatus.includes(String(data?.status))?String(data.status):'inactive'
      const scheduled=String(data?.scheduled_change?.action||'')
      const row={
        user_id:userId,paddle_subscription_id:data?.id||null,paddle_customer_id:customerId||null,
        plan_key:planKey,status,price_id:priceId||null,currency:data?.currency_code||null,
        current_period_start:data?.current_billing_period?.starts_at||null,current_period_end:data?.current_billing_period?.ends_at||null,
        trial_end:data?.next_billed_at&&status==='trialing'?data.next_billed_at:null,
        scheduled_change:['cancel','pause','resume'].includes(scheduled)?scheduled:null,updated_at:new Date().toISOString()
      }
      const {error}=await admin.from('billing_subscriptions').upsert(row,{onConflict:'user_id'})
      if(error)throw new Error('SUBSCRIPTION_WRITE_FAILED')
    }
    const {error:finishError}=await admin.from('billing_events').update({safe_error_code:null,processed_at:new Date().toISOString()}).eq('paddle_event_id',eventId)
    if(finishError)throw new Error('EVENT_FINALIZE_FAILED')
    return plainJson(200,{received:true})
  }catch(error){
    const code=String((error as Error)?.message||'WEBHOOK_PROCESSING_FAILED').replace(/[^A-Z0-9_]/gi,'_').slice(0,80)
    await admin.from('billing_events').update({safe_error_code:code,processed_at:new Date().toISOString()}).eq('paddle_event_id',eventId)
    await captureSafeFailure('billing-webhook',code,error)
    return plainJson(500,{error:'WEBHOOK_PROCESSING_FAILED'})
  }
})
