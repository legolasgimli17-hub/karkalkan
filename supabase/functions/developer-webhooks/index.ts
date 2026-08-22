import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { createTransactionPool } from '../_shared/postgres.ts'
import { readJsonBody, requestError } from '../_shared/request-security.ts'
import { DEVELOPER_WEBHOOK_EVENTS, deliverOutboundEvent, safeWebhookUrl } from '../_shared/outbound-webhooks.ts'

const sql=createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL')||'')
const MAX_WEBHOOKS=10
const EVENT_SET=new Set<string>(DEVELOPER_WEBHOOK_EVENTS)

function clean(value:unknown,max:number){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)}
function isUuid(value:unknown){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))}
function base64url(bytes:Uint8Array){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function makeSecret(){return `whsec_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`}
function events(value:unknown){if(!Array.isArray(value))return ['sync.completed'];return [...new Set(value.map(item=>clean(item,40)).filter(item=>EVENT_SET.has(item)))]}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(!['GET','POST'].includes(req.method))return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  if(!sql)return json(503,{error:'SERVER_CONFIG'},origin)

  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)

  if(req.method==='GET'){
    const rows=await sql`select id,endpoint_url,event_types,status,failure_count,last_delivery_at,last_success_at,last_error_code,created_at,updated_at from public.developer_webhooks where user_id=${auth.user.id}::uuid order by created_at desc limit 20`
    const deliveries=await sql`select webhook_id,event_type,status,http_status,safe_error_code,attempted_at,delivered_at from public.developer_webhook_deliveries where user_id=${auth.user.id}::uuid order by attempted_at desc limit 30`
    return json(200,{webhooks:rows.map((row:any)=>({id:row.id,endpointUrl:row.endpoint_url,eventTypes:row.event_types,status:row.status,failureCount:Number(row.failure_count),lastDeliveryAt:row.last_delivery_at,lastSuccessAt:row.last_success_at,lastErrorCode:row.last_error_code,createdAt:row.created_at,updatedAt:row.updated_at})),recentDeliveries:deliveries.map((row:any)=>({webhookId:row.webhook_id,eventType:row.event_type,status:row.status,httpStatus:row.http_status,safeErrorCode:row.safe_error_code,attemptedAt:row.attempted_at,deliveredAt:row.delivered_at}))},origin)
  }

  let body:any
  try{body=await readJsonBody(req,16*1024)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}
  const action=clean(body?.action||'create',20)

  if(action==='disable'||action==='enable'){
    const id=clean(body?.id,36)
    if(!isUuid(id))return json(400,{error:'INVALID_WEBHOOK_ID'},origin)
    const status=action==='enable'?'active':'disabled'
    const rows=await sql`update public.developer_webhooks set status=${status},updated_at=now() where id=${id}::uuid and user_id=${auth.user.id}::uuid returning id,status`
    if(!rows.length)return json(404,{error:'NOT_FOUND'},origin)
    return json(200,{ok:true,id:rows[0].id,status:rows[0].status},origin)
  }

  if(action==='test'){
    const id=clean(body?.id,36)
    if(!isUuid(id))return json(400,{error:'INVALID_WEBHOOK_ID'},origin)
    const rows=await sql`select id,status,event_types from public.developer_webhooks where id=${id}::uuid and user_id=${auth.user.id}::uuid limit 1`
    if(!rows.length)return json(404,{error:'NOT_FOUND'},origin)
    if(rows[0].status!=='active')return json(409,{error:'WEBHOOK_DISABLED'},origin)
    if(!Array.isArray(rows[0].event_types)||!rows[0].event_types.includes('webhook.test'))return json(409,{error:'TEST_EVENT_NOT_SUBSCRIBED'},origin)
    const result=await deliverOutboundEvent(sql,auth.user.id,'webhook.test',{message:'KârKalkan imzalı webhook testi',webhookId:id})
    return json(result.delivered>0?200:502,{ok:result.delivered>0,...result},origin)
  }

  if(action!=='create')return json(400,{error:'INVALID_ACTION'},origin)
  const endpoint=safeWebhookUrl(body?.endpoint_url),eventTypes=events(body?.event_types)
  if(!endpoint)return json(400,{error:'INVALID_WEBHOOK_URL',requirement:'Public HTTPS URL, port 443, no localhost/IP/internal hostname'},origin)
  if(!eventTypes.length)return json(400,{error:'INVALID_EVENT_TYPES',allowed:DEVELOPER_WEBHOOK_EVENTS},origin)

  const count=await sql`select count(*)::int as count from public.developer_webhooks where user_id=${auth.user.id}::uuid`
  if(Number(count[0]?.count||0)>=MAX_WEBHOOKS)return json(409,{error:'WEBHOOK_LIMIT',limit:MAX_WEBHOOKS},origin)

  const id=crypto.randomUUID(),secret=makeSecret(),vaultName=`kk.developer.webhook.${auth.user.id}.${id}`
  let vaultId=''
  try{
    const vaultRows=await sql`select vault.create_secret(${secret},${vaultName},${'KârKalkan outbound webhook signing secret'},null::uuid) as id`
    vaultId=String(vaultRows[0]?.id||'')
    if(!isUuid(vaultId))throw new Error('VAULT_CREATE_FAILED')
    const rows=await sql`insert into public.developer_webhooks(id,user_id,endpoint_url,event_types,vault_secret_id) values(${id}::uuid,${auth.user.id}::uuid,${endpoint},${eventTypes},${vaultId}::uuid) returning id,endpoint_url,event_types,status,created_at`
    const row=rows[0]
    return json(201,{webhook:{id:row.id,endpointUrl:row.endpoint_url,eventTypes:row.event_types,status:row.status,createdAt:row.created_at},signingSecret:secret,signature:'HMAC-SHA256 over `${X-Karkalkan-Timestamp}.${rawBody}`',warning:'İmzalama anahtarı yalnızca şimdi gösterilir.'},origin)
  }catch(error){
    if(vaultId&&isUuid(vaultId))await sql`delete from vault.secrets where id=${vaultId}::uuid`.catch(()=>{})
    const code=error instanceof Error&&String(error.message).toLowerCase().includes('duplicate')?'WEBHOOK_EXISTS':'WEBHOOK_CREATE_FAILED'
    return json(code==='WEBHOOK_EXISTS'?409:500,{error:code},origin)
  }
})
