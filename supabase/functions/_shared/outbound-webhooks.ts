const encoder=new TextEncoder()

export const DEVELOPER_WEBHOOK_EVENTS=['webhook.test','sync.completed','sync.failed','reconciliation.matched'] as const

function clean(value:unknown,max:number){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)}
function isIpv4(host:string){return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)}

export function safeWebhookUrl(value:unknown){
  const raw=clean(value,500)
  try{
    const url=new URL(raw)
    const host=url.hostname.toLowerCase()
    if(url.protocol!=='https:'||url.username||url.password)return null
    if(url.port&&url.port!=='443')return null
    if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))return null
    if(isIpv4(host)||host.includes(':')||host==='0.0.0.0')return null
    url.hash=''
    return url.toString()
  }catch{return null}
}

async function hmac(secret:string,message:string){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(message))
  return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,'0')).join('')
}

async function postOnce(endpoint:string,body:string,eventType:string,eventId:string,timestamp:string,secret:string){
  const signature=await hmac(secret,`${timestamp}.${body}`)
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'Karkalkan-Webhooks/1.0','X-Karkalkan-Event':eventType,'X-Karkalkan-Delivery':eventId,'X-Karkalkan-Timestamp':timestamp,'X-Karkalkan-Signature':`v1=${signature}`},body,redirect:'error',signal:AbortSignal.timeout(8_000)})
  return response.status
}

export async function deliverOutboundEvent(sql:any,userId:string,eventType:string,data:Record<string,unknown>){
  if(!DEVELOPER_WEBHOOK_EVENTS.includes(eventType as any))return {eventId:null,delivered:0,failed:0}
  const hooks=await sql`select id,endpoint_url,vault_secret_id from public.developer_webhooks where user_id=${userId}::uuid and status='active' and event_types @> array[${eventType}]::text[] order by created_at asc limit 10`
  if(!hooks.length)return {eventId:null,delivered:0,failed:0}

  const eventId=crypto.randomUUID(),createdAt=new Date().toISOString(),timestamp=String(Math.floor(Date.now()/1000))
  const body=JSON.stringify({id:eventId,type:eventType,created_at:createdAt,data})
  let delivered=0,failed=0

  for(const hook of hooks){
    const endpoint=safeWebhookUrl(hook.endpoint_url)
    const secrets=await sql`select decrypted_secret from vault.decrypted_secrets where id=${hook.vault_secret_id}::uuid limit 1`
    const secret=String(secrets[0]?.decrypted_secret||'')
    let httpStatus:number|null=null,safeErrorCode:string|null=null
    if(!endpoint||!secret){safeErrorCode=!endpoint?'WEBHOOK_URL_INVALID':'WEBHOOK_SECRET_MISSING'}
    else{
      try{
        httpStatus=await postOnce(endpoint,body,eventType,eventId,timestamp,secret)
        if(httpStatus>=500){await new Promise(resolve=>setTimeout(resolve,300));httpStatus=await postOnce(endpoint,body,eventType,eventId,timestamp,secret)}
        if(httpStatus<200||httpStatus>=300)safeErrorCode=`WEBHOOK_HTTP_${httpStatus}`
      }catch(error){safeErrorCode=error instanceof DOMException&&error.name==='TimeoutError'?'WEBHOOK_TIMEOUT':'WEBHOOK_NETWORK'}
    }

    const ok=!safeErrorCode
    if(ok)delivered++;else failed++
    await sql.begin(async(tx:any)=>{
      await tx`insert into public.developer_webhook_deliveries(webhook_id,user_id,event_id,event_type,status,http_status,safe_error_code,delivered_at) values(${hook.id}::uuid,${userId}::uuid,${eventId}::uuid,${eventType},${ok?'delivered':'failed'},${httpStatus},${safeErrorCode},${ok?new Date().toISOString():null}::timestamptz) on conflict (webhook_id,event_id) do nothing`
      if(ok)await tx`update public.developer_webhooks set failure_count=0,last_delivery_at=now(),last_success_at=now(),last_error_code=null,updated_at=now() where id=${hook.id}::uuid and user_id=${userId}::uuid`
      else await tx`update public.developer_webhooks set failure_count=failure_count+1,last_delivery_at=now(),last_error_code=${safeErrorCode},updated_at=now() where id=${hook.id}::uuid and user_id=${userId}::uuid`
    })
  }
  return {eventId,delivered,failed}
}
