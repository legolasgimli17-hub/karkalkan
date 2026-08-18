import { createTransactionPool } from '../_shared/postgres.ts'
import { captureSafeFailure } from '../_shared/observability.ts'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const DB_URL=Deno.env.get('KARKALKAN_DB_POOLER_URL')||''
const sql=createTransactionPool(DB_URL,{max_lifetime:60})
const APP_RETURN_URL='https://karkalkan.vercel.app/uygulama'
const LWA_TOKEN_URL='https://api.amazon.com/auth/o2/token'

function redirect(result:'connected'|'error',code?:string){
  const target=new URL(APP_RETURN_URL)
  target.searchParams.set('amazon',result)
  if(code)target.searchParams.set('code',code.slice(0,80))
  return new Response(null,{status:303,headers:{Location:target.toString(),'Cache-Control':'no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}})
}
function bytesToHex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('')}
async function sha256(value:string){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))}
function configuredValue(name:string,max:number){const value=String(Deno.env.get(name)||'').trim();return value&&value.length<=max?value:''}
function callbackUri(){
  const configured=configuredValue('AMAZON_SPAPI_REDIRECT_URI',500)
  const value=configured||`${PROJECT_URL}/functions/v1/amazon-auth-callback`
  try{const url=new URL(value);return url.protocol==='https:'?url.toString():''}catch{return ''}
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='GET')return new Response('Method not allowed',{status:405,headers:{'Cache-Control':'no-store','Content-Type':'text/plain; charset=utf-8'}})
  if(!PROJECT_URL||!sql)return redirect('error','SERVER_CONFIG')
  const requestUrl=new URL(req.url)
  const state=String(requestUrl.searchParams.get('state')||'')
  const oauthCode=String(requestUrl.searchParams.get('spapi_oauth_code')||'')
  const sellerId=String(requestUrl.searchParams.get('selling_partner_id')||'')
  const providerError=String(requestUrl.searchParams.get('error')||'')
  if(!/^[A-Za-z0-9_-]{43}$/.test(state))return redirect('error','AMAZON_OAUTH_STATE_INVALID')
  if(providerError&&providerError.length<=120){
    try{const hash=await sha256(state);await sql`update public.amazon_oauth_states set consumed_at=now() where state_hash=${hash} and consumed_at is null and expires_at>now()`}catch{}
    return redirect('error','AMAZON_OAUTH_CANCELLED')
  }
  if(oauthCode.length<8||oauthCode.length>2048||!/^[A-Za-z0-9_-]{5,120}$/.test(sellerId))return redirect('error','AMAZON_OAUTH_RESPONSE_INVALID')
  const clientId=configuredValue('AMAZON_LWA_CLIENT_ID',300)
  const clientSecret=configuredValue('AMAZON_LWA_CLIENT_SECRET',500)
  const redirectUri=callbackUri()
  if(!clientId||!clientSecret||!redirectUri)return redirect('error','AMAZON_APP_NOT_CONFIGURED')

  let stateRow:any
  try{
    const hash=await sha256(state)
    const rows=await sql`update public.amazon_oauth_states set consumed_at=now() where state_hash=${hash} and consumed_at is null and expires_at>now() returning connection_id,user_id`
    stateRow=rows[0]
    if(!stateRow)return redirect('error','AMAZON_OAUTH_STATE_EXPIRED')
  }catch(error){
    await captureSafeFailure('amazon-auth-callback','AMAZON_OAUTH_STATE_FAILED',error)
    return redirect('error','AMAZON_OAUTH_STATE_FAILED')
  }

  try{
    const form=new URLSearchParams({grant_type:'authorization_code',code:oauthCode,redirect_uri:redirectUri,client_id:clientId,client_secret:clientSecret})
    const tokenResponse=await fetch(LWA_TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',Accept:'application/json'},body:form,signal:AbortSignal.timeout(20_000)})
    if(!tokenResponse.ok)throw new Error(`LWA_HTTP_${tokenResponse.status}`)
    const tokens=await tokenResponse.json()
    const refreshToken=String(tokens?.refresh_token||'')
    if(refreshToken.length<20||refreshToken.length>4096)throw new Error('LWA_REFRESH_TOKEN_INVALID')
    const connectionId=String(stateRow.connection_id),userId=String(stateRow.user_id)
    const secretName=`kk.amazon.${connectionId}.refresh_token`
    await sql.begin(async tx=>{
      const existing=await tx`select id from vault.secrets where name=${secretName} limit 1`
      const description='KârKalkan Amazon SP-API LWA refresh token'
      if(existing.length)await tx`select vault.update_secret(${String(existing[0].id)}::uuid,${refreshToken},${secretName},${description})`
      else await tx`select vault.create_secret(${refreshToken},${secretName},${description})`
      const updated=await tx`update public.marketplace_connections set external_seller_id=${sellerId},status='connected',updated_at=now() where id=${connectionId}::uuid and user_id=${userId}::uuid and marketplace='amazon' returning id`
      if(!updated.length)throw new Error('AMAZON_CONNECTION_NOT_FOUND')
    })
    return redirect('connected')
  }catch(error){
    await captureSafeFailure('amazon-auth-callback','AMAZON_OAUTH_EXCHANGE_FAILED',error)
    return redirect('error','AMAZON_OAUTH_EXCHANGE_FAILED')
  }
})
