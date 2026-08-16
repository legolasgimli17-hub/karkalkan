import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import postgres from 'npm:postgres@3.4.7'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
const DB_URL=Deno.env.get('SUPABASE_DB_URL')||''
const sql=DB_URL?postgres(DB_URL,{prepare:false,max:1,idle_timeout:5,max_lifetime:120}):null

function allowedOrigin(o:string|null){if(!o)return true;if(o==='https://karkalkan.vercel.app'||o===PROJECT_ORIGIN)return true;try{const u=new URL(o);return u.protocol==='https:'&&u.hostname.endsWith('-krgzabdullah22-8562s-projects.vercel.app')}catch{return false}}
function headers(o:string|null){const h:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};if(o&&allowedOrigin(o)){h['Access-Control-Allow-Origin']=o;h['Access-Control-Allow-Headers']='authorization, apikey, content-type';h['Access-Control-Allow-Methods']='GET, POST, OPTIONS'}return h}
function json(s:number,b:unknown,o:string|null){return new Response(JSON.stringify(b),{status:s,headers:headers(o)})}
function validUuid(v:string){return /^[0-9a-f-]{36}$/i.test(v)}
function basic(v:string){const b=new TextEncoder().encode(v);let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s)}
async function sha256(v:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function randomSecret(){const bytes=crypto.getRandomValues(new Uint8Array(32));return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin');if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)})
  if(!['GET','POST'].includes(req.method))return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return json(401,{error:'UNAUTHORIZED'},origin)
  const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default;if(!PROJECT_URL||!pub||!sql)return json(503,{error:'SERVER_CONFIG'},origin)
  const sb=createClient(PROJECT_URL,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),{data:ud,error:ue}=await sb.auth.getUser(auth.slice(7)),user=ud?.user;if(ue||!user)return json(401,{error:'UNAUTHORIZED'},origin)
  const u=new URL(req.url);let connectionId=u.searchParams.get('connection_id')||''
  let body:any={};if(req.method==='POST'){try{body=await req.json()}catch{return json(400,{error:'INVALID_JSON'},origin)}connectionId=String(body?.connection_id||connectionId)}
  if(!validUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
  const {data:conn,error:ce}=await sb.from('marketplace_connections').select('id,marketplace,external_seller_id').eq('id',connectionId).maybeSingle();if(ce)return json(500,{error:'DB_ERROR'},origin);if(!conn||conn.marketplace!=='trendyol')return json(404,{error:'NOT_FOUND'},origin)
  const existing=await sql`select provider_webhook_id,status,endpoint_url,subscribed_statuses,registered_at,updated_at from public.marketplace_webhooks where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid limit 1`
  if(req.method==='GET')return json(200,{configured:!!existing.length,webhook:existing[0]||null},origin)
  if(existing.length&&existing[0].status==='active')return json(200,{ok:true,configured:true,alreadyActive:true,webhook:existing[0]},origin)
  const sellerId=String(conn.external_seller_id||'');if(!/^\d{1,20}$/.test(sellerId))return json(400,{error:'INVALID_SELLER_ID'},origin)
  const kn=`kk.trendyol.${connectionId}.key`,sn=`kk.trendyol.${connectionId}.secret`,sec=await sql`select name,decrypted_secret from vault.decrypted_secrets where name in (${kn},${sn})`,map=new Map(sec.map((r:any)=>[String(r.name),String(r.decrypted_secret||'')])),apiKey=map.get(kn)||'',apiSecret=map.get(sn)||'';if(!apiKey||!apiSecret)return json(409,{error:'CREDENTIALS_MISSING'},origin)
  const hookSecret=randomSecret(),secretHash=await sha256(hookSecret),endpoint=`${PROJECT_URL}/functions/v1/order-events?c=${encodeURIComponent(connectionId)}`
  const payload={url:endpoint,authenticationType:'API_KEY',apiKey:hookSecret,subscribedStatuses:[] as string[]}
  let response:Response;try{response=await fetch(`https://apigw.trendyol.com/integration/webhook/sellers/${encodeURIComponent(sellerId)}/webhooks`,{method:'POST',headers:{Authorization:`Basic ${basic(`${apiKey}:${apiSecret}`)}`,'User-Agent':`${sellerId} - Karkalkan`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20_000)})}catch{return json(502,{error:'WEBHOOK_NETWORK'},origin)}
  if(response.status===401)return json(401,{error:'TRENDYOL_UNAUTHORIZED'},origin);if(response.status===403)return json(502,{error:'TRENDYOL_FORBIDDEN'},origin);if(response.status===429)return json(429,{error:'TRENDYOL_RATE_LIMIT'},origin);if(!response.ok)return json(502,{error:'WEBHOOK_HTTP_ERROR',status:response.status},origin)
  let data:any={};try{data=await response.json()}catch{}
  const providerId=String(data?.id||'').slice(0,180);if(!providerId)return json(502,{error:'WEBHOOK_BAD_RESPONSE'},origin)
  const rows=await sql`insert into public.marketplace_webhooks(connection_id,user_id,provider_webhook_id,secret_hash,endpoint_url,status,subscribed_statuses,registered_at,updated_at) values(${connectionId}::uuid,${user.id}::uuid,${providerId},${secretHash},${endpoint},'active',${sql.array([],'text')},now(),now()) on conflict (connection_id) do update set provider_webhook_id=excluded.provider_webhook_id,secret_hash=excluded.secret_hash,endpoint_url=excluded.endpoint_url,status='active',subscribed_statuses=excluded.subscribed_statuses,registered_at=now(),updated_at=now() returning provider_webhook_id,status,endpoint_url,registered_at`
  return json(200,{ok:true,configured:true,webhook:rows[0]},origin)
})
