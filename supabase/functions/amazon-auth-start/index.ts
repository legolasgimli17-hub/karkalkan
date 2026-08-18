import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { createTransactionPool } from '../_shared/postgres.ts'
import { captureSafeFailure } from '../_shared/observability.ts'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
const DB_URL=Deno.env.get('KARKALKAN_DB_POOLER_URL')||''
const sql=createTransactionPool(DB_URL,{max_lifetime:60})
const SELLER_CENTRAL_ORIGIN='https://sellercentral.amazon.com.tr'
const STATE_TTL_MINUTES=10

function allowedOrigin(origin:string|null){
  if(!origin)return true
  if(origin==='https://karkalkan.vercel.app'||origin===PROJECT_ORIGIN)return true
  try{const url=new URL(origin);return url.protocol==='https:'&&url.hostname.endsWith('-krgzabdullah22-8562s-projects.vercel.app')}catch{return false}
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
function bytesToHex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('')}
function base64Url(bytes:Uint8Array){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
async function sha256(value:string){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))}
function configuredValue(name:string,max:number){const value=String(Deno.env.get(name)||'').trim();return value&&value.length<=max?value:''}

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
  const applicationId=configuredValue('AMAZON_SPAPI_APPLICATION_ID',300)
  const clientId=configuredValue('AMAZON_LWA_CLIENT_ID',300)
  const clientSecret=configuredValue('AMAZON_LWA_CLIENT_SECRET',500)
  if(!applicationId||!clientId||!clientSecret)return json(409,{error:'AMAZON_APP_NOT_CONFIGURED'},origin)
  const userClient=createClient(PROJECT_URL,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
  const token=auth.slice(7),{data:userData,error:userError}=await userClient.auth.getUser(token),user=userData?.user
  if(userError||!user)return json(401,{error:'UNAUTHORIZED'},origin)
  let body:any
  try{body=await req.json()}catch{return json(400,{error:'INVALID_JSON'},origin)}
  const connectionId=String(body?.connection_id||'')
  if(!validUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
  const {data:connection,error:connectionError}=await userClient.from('marketplace_connections').select('id,marketplace').eq('id',connectionId).maybeSingle()
  if(connectionError)return json(500,{error:'DB_ERROR'},origin)
  if(!connection||connection.marketplace!=='amazon')return json(404,{error:'NOT_FOUND'},origin)

  try{
    const state=base64Url(crypto.getRandomValues(new Uint8Array(32)))
    const stateHash=await sha256(state)
    await sql.begin(async tx=>{
      await tx`delete from public.amazon_oauth_states where expires_at<now() or consumed_at<now()-interval '1 day'`
      await tx`delete from public.amazon_oauth_states where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and consumed_at is null`
      await tx`insert into public.amazon_oauth_states(state_hash,connection_id,user_id,expires_at) values(${stateHash},${connectionId}::uuid,${user.id}::uuid,now()+${STATE_TTL_MINUTES}*interval '1 minute')`
    })
    const authorizationUrl=new URL('/apps/authorize/consent',SELLER_CENTRAL_ORIGIN)
    authorizationUrl.searchParams.set('application_id',applicationId)
    authorizationUrl.searchParams.set('state',state)
    const stage=String(Deno.env.get('AMAZON_SPAPI_APP_STAGE')||'draft').trim().toLowerCase()
    if(stage!=='published')authorizationUrl.searchParams.set('version','beta')
    return json(200,{authorizationUrl:authorizationUrl.toString(),stage:stage==='published'?'published':'draft'},origin)
  }catch(error){
    await captureSafeFailure('amazon-auth-start','AMAZON_AUTH_START_FAILED',error)
    return json(500,{error:'AMAZON_AUTH_START_FAILED'},origin)
  }
})
