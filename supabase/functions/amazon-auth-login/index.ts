import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { createTransactionPool } from '../_shared/postgres.ts'
import { captureSafeFailure } from '../_shared/observability.ts'
import { consumeRateLimit, isUuid, readJsonBody, requestError } from '../_shared/request-security.ts'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
const DB_URL=Deno.env.get('KARKALKAN_DB_POOLER_URL')||''
const sql=createTransactionPool(DB_URL,{max_lifetime:60})
const STATE_TTL_MINUTES=10
const AMAZON_CALLBACK_HOSTS=new Set(['sellercentral.amazon.com.tr','sellercentral.amazon.com'])

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
function bytesToHex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('')}
function base64Url(bytes:Uint8Array){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
async function sha256(value:string){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))}
function configuredValue(name:string,max:number){const value=String(Deno.env.get(name)||'').trim();return value&&value.length<=max?value:''}
function redirectUri(){
  const configured=configuredValue('AMAZON_SPAPI_REDIRECT_URI',500),value=configured||`${PROJECT_URL}/functions/v1/amazon-auth-callback`
  try{const url=new URL(value);return url.protocol==='https:'?url.toString():''}catch{return ''}
}
function validAmazonCallback(value:string,applicationId:string){
  try{
    const url=new URL(value)
    return url.protocol==='https:'&&AMAZON_CALLBACK_HOSTS.has(url.hostname)&&url.pathname===`/apps/authorize/confirm/${applicationId}`&&!url.username&&!url.password&&!url.hash
  }catch{return false}
}

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
  const applicationId=configuredValue('AMAZON_SPAPI_APPLICATION_ID',300),registeredRedirect=redirectUri()
  if(!applicationId||!registeredRedirect)return json(409,{error:'AMAZON_APP_NOT_CONFIGURED'},origin)
  const userClient=createClient(PROJECT_URL,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
  const token=auth.slice(7),{data:userData,error:userError}=await userClient.auth.getUser(token),user=userData?.user
  if(userError||!user)return json(401,{error:'UNAUTHORIZED'},origin)
  let body:any
  try{body=await readJsonBody(req,32_768)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}
  const connectionId=String(body?.connection_id||''),amazonCallbackUri=String(body?.amazon_callback_uri||'')
  const amazonState=String(body?.amazon_state||''),sellerId=String(body?.selling_partner_id||''),version=String(body?.version||'')
  if(!isUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
  if(!validAmazonCallback(amazonCallbackUri,applicationId)||amazonState.length<8||amazonState.length>500||!/^[A-Za-z0-9._~-]+$/.test(amazonState)||!/^[A-Za-z0-9_-]{5,120}$/.test(sellerId)||!['','beta'].includes(version))return json(400,{error:'AMAZON_LOGIN_REQUEST_INVALID'},origin)
  const {data:connection,error:connectionError}=await userClient.from('marketplace_connections').select('id,marketplace').eq('id',connectionId).maybeSingle()
  if(connectionError)return json(500,{error:'DB_ERROR'},origin)
  if(!connection||connection.marketplace!=='amazon')return json(404,{error:'NOT_FOUND'},origin)
  if(!await consumeRateLimit(sql,'amazon-auth-login',`${user.id}:${connectionId}`,10,600))return json(429,{error:'RATE_LIMITED'},origin)

  try{
    const state=base64Url(crypto.getRandomValues(new Uint8Array(32))),stateHash=await sha256(state)
    await sql.begin(async tx=>{
      await tx`delete from public.amazon_oauth_states where expires_at<now() or consumed_at<now()-interval '1 day'`
      await tx`delete from public.amazon_oauth_states where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and consumed_at is null`
      await tx`insert into public.amazon_oauth_states(state_hash,connection_id,user_id,expected_seller_id,expires_at) values(${stateHash},${connectionId}::uuid,${user.id}::uuid,${sellerId},now()+${STATE_TTL_MINUTES}*interval '1 minute')`
    })
    const target=new URL(amazonCallbackUri)
    target.searchParams.set('amazon_state',amazonState)
    target.searchParams.set('state',state)
    target.searchParams.set('redirect_uri',registeredRedirect)
    const stage=String(Deno.env.get('AMAZON_SPAPI_APP_STAGE')||'draft').trim().toLowerCase()
    if(stage!=='published')target.searchParams.set('version','beta')
    else target.searchParams.delete('version')
    return json(200,{continuationUrl:target.toString()},origin)
  }catch(error){
    await captureSafeFailure('amazon-auth-login','AMAZON_LOGIN_HANDOFF_FAILED',error)
    return json(500,{error:'AMAZON_LOGIN_HANDOFF_FAILED'},origin)
  }
})
