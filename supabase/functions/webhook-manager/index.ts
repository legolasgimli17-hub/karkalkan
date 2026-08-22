import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { createTransactionPool } from '../_shared/postgres.ts'
import { readJsonBody, requestError } from '../_shared/request-security.ts'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
const DB_URL=Deno.env.get('KARKALKAN_DB_POOLER_URL')||''
const sql=createTransactionPool(DB_URL)

function allowedOrigin(o:string|null){if(!o)return true;if(o==='https://karkalkan.vercel.app'||o===PROJECT_ORIGIN)return true;try{const u=new URL(o);return u.protocol==='https:'&&Boolean(Deno.env.get('KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX'))&&u.hostname.endsWith(String(Deno.env.get('KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX')))}catch{return false}}
function headers(o:string|null){const h:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};if(o&&allowedOrigin(o)){h['Access-Control-Allow-Origin']=o;h['Access-Control-Allow-Headers']='authorization, apikey, content-type';h['Access-Control-Allow-Methods']='GET, POST, OPTIONS'}return h}
function json(s:number,b:unknown,o:string|null){return new Response(JSON.stringify(b),{status:s,headers:headers(o)})}
function validUuid(v:string){return /^[0-9a-f-]{36}$/i.test(v)}
function basic(v:string){const b=new TextEncoder().encode(v);let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s)}
async function sha256(v:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function randomSecret(){const bytes=crypto.getRandomValues(new Uint8Array(32));return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function providerRequest(url:string,auth:string,userAgent:string,init:RequestInit={}){let r:Response;try{r=await fetch(url,{...init,headers:{Authorization:auth,'User-Agent':userAgent,Accept:'application/json',...(init.headers||{})},redirect:'error',signal:AbortSignal.timeout(20_000)})}catch{throw new Error('WEBHOOK_NETWORK')}if(r.status===401)throw new Error('TRENDYOL_UNAUTHORIZED');if(r.status===403)throw new Error('TRENDYOL_FORBIDDEN');if(r.status===429)throw new Error('TRENDYOL_RATE_LIMIT');if(!r.ok)throw new Error(`WEBHOOK_HTTP_${r.status}`);return r}
function statusForError(e:unknown){const c=e instanceof Error?e.message:'WEBHOOK_ERROR';return c==='TRENDYOL_UNAUTHORIZED'?401:c==='TRENDYOL_RATE_LIMIT'?429:502}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)})
 if(!['GET','POST'].includes(req.method))return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
 const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return json(401,{error:'UNAUTHORIZED'},origin)
 const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default;if(!PROJECT_URL||!pub||!sql)return json(503,{error:'SERVER_CONFIG'},origin)
 const sb=createClient(PROJECT_URL,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),{data:ud,error:ue}=await sb.auth.getUser(auth.slice(7)),user=ud?.user;if(ue||!user)return json(401,{error:'UNAUTHORIZED'},origin)
 const u=new URL(req.url);let body:any={},connectionId=u.searchParams.get('connection_id')||'';if(req.method==='POST'){try{body=await readJsonBody(req,16*1024)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}connectionId=String(body?.connection_id||connectionId)}
 if(!validUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
 const {data:conn,error:ce}=await sb.from('marketplace_connections').select('id,marketplace,external_seller_id').eq('id',connectionId).maybeSingle();if(ce)return json(500,{error:'DB_ERROR'},origin);if(!conn||conn.marketplace!=='trendyol')return json(404,{error:'NOT_FOUND'},origin)
 const sellerId=String(conn.external_seller_id||'');if(!/^\d{1,20}$/.test(sellerId))return json(400,{error:'INVALID_SELLER_ID'},origin)
 const localRows=await sql`select provider_webhook_id,status,endpoint_url,subscribed_statuses,registered_at,updated_at from public.marketplace_webhooks where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid limit 1`,local=localRows[0]||null
 const kn=`kk.trendyol.${connectionId}.key`,sn=`kk.trendyol.${connectionId}.secret`,sec=await sql`select name,decrypted_secret from vault.decrypted_secrets where name in (${kn},${sn})`,map=new Map(sec.map((r:any)=>[String(r.name),String(r.decrypted_secret||'')])),apiKey=map.get(kn)||'',apiSecret=map.get(sn)||''
 if(!apiKey||!apiSecret)return json(409,{error:'CREDENTIALS_MISSING',configured:!!local,active:false,providerVerified:false},origin)
 const providerAuth=`Basic ${basic(`${apiKey}:${apiSecret}`)}`,userAgent=`${sellerId} - Karkalkan`,base=`https://apigw.trendyol.com/integration/webhook/sellers/${encodeURIComponent(sellerId)}/webhooks`,endpoint=`${PROJECT_URL}/functions/v1/order-events?c=${encodeURIComponent(connectionId)}`
 let hooks:any[];try{const r=await providerRequest(base,providerAuth,userAgent);const parsed=await r.json();hooks=Array.isArray(parsed)?parsed:[]}catch(e){return json(statusForError(e),{error:e instanceof Error?e.message:'WEBHOOK_ERROR',configured:!!local,active:false,providerVerified:false},origin)}
 const remote=hooks.find(h=>String(h?.id||'')===String(local?.provider_webhook_id||''))||hooks.find(h=>String(h?.url||'')===endpoint)||null
 if(req.method==='GET'){
   const providerStatus=String(remote?.status||'MISSING').toUpperCase(),active=!!remote&&providerStatus==='ACTIVE'&&String(remote?.url||'')===endpoint
   const localStatus=active?'active':remote?'disabled':'error';if(local&&String(local.status)!==localStatus)await sql`update public.marketplace_webhooks set status=${localStatus},updated_at=now() where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid`
   return json(200,{configured:!!local,active,providerVerified:true,providerStatus,needsRepair:!active,webhook:local?{provider_webhook_id:local.provider_webhook_id,status:localStatus,registered_at:local.registered_at,updated_at:local.updated_at}:null},origin)
 }
 const hookSecret=randomSecret(),secretHash=await sha256(hookSecret),payload={url:endpoint,authenticationType:'API_KEY',apiKey:hookSecret,subscribedStatuses:[] as string[]};let providerId=''
 try{
   if(remote){providerId=String(remote.id||'').slice(0,180);await providerRequest(`${base}/${encodeURIComponent(providerId)}`,providerAuth,userAgent,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(String(remote.status||'').toUpperCase()!=='ACTIVE')await providerRequest(`${base}/${encodeURIComponent(providerId)}/activate`,providerAuth,userAgent,{method:'PUT'})}
   else{const r=await providerRequest(base,providerAuth,userAgent,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});let data:any={};try{data=await r.json()}catch{}providerId=String(data?.id||'').slice(0,180);if(!providerId)throw new Error('WEBHOOK_BAD_RESPONSE')}
 }catch(e){if(local)await sql`update public.marketplace_webhooks set status='error',updated_at=now() where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid`;return json(statusForError(e),{error:e instanceof Error?e.message:'WEBHOOK_ERROR',active:false,providerVerified:true},origin)}
 const rows=await sql`insert into public.marketplace_webhooks(connection_id,user_id,provider_webhook_id,secret_hash,endpoint_url,status,subscribed_statuses,registered_at,updated_at) values(${connectionId}::uuid,${user.id}::uuid,${providerId},${secretHash},${endpoint},'active','{}'::text[],now(),now()) on conflict (connection_id) do update set provider_webhook_id=excluded.provider_webhook_id,secret_hash=excluded.secret_hash,endpoint_url=excluded.endpoint_url,status='active',subscribed_statuses=excluded.subscribed_statuses,updated_at=now() returning provider_webhook_id,status,registered_at,updated_at`
 return json(200,{ok:true,configured:true,active:true,providerVerified:true,providerStatus:'ACTIVE',rotated:!!remote,webhook:rows[0]},origin)
})
