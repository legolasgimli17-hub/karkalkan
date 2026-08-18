import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { isMarketplace, PROVIDERS, publicProviderCatalog } from '../_shared/providers.ts'

const url=Deno.env.get('SUPABASE_URL')||''
const projectOrigin=(()=>{try{return new URL(url).origin}catch{return ''}})()
const allowedOrigins=new Set(['https://karkalkan.vercel.app',projectOrigin])
function isAllowedOrigin(origin:string|null){if(!origin)return true;if(allowedOrigins.has(origin))return true;try{const u=new URL(origin);return u.protocol==='https:'&&u.hostname.endsWith('-krgzabdullah22-8562s-projects.vercel.app')}catch{return false}}
function cors(origin:string|null){const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Vary':'Origin'};if(origin&&isAllowedOrigin(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type';headers['Access-Control-Allow-Methods']='GET, POST, DELETE, OPTIONS'}return headers}
function json(body:unknown,status:number,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)})}
function cleanText(value:unknown,max:number){const s=String(value??'').trim();return s.length<=max?s:''}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('origin')
  if(!isAllowedOrigin(origin))return json({error:'ORIGIN_NOT_ALLOWED'},403,origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)})
  const authHeader=req.headers.get('authorization')||''
  if(!authHeader.startsWith('Bearer '))return json({error:'UNAUTHENTICATED'},401,origin)
  const token=authHeader.slice(7)
  const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default
  if(!url||!publishable||!secret)return json({error:'SERVER_MISCONFIGURED'},503,origin)
  const userClient=createClient(url,publishable,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}})
  const {data:userData,error:userError}=await userClient.auth.getUser(token)
  const user=userData?.user
  if(userError||!user)return json({error:'UNAUTHENTICATED'},401,origin)
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})

  if(req.method==='GET'){
    const {data,error}=await admin.from('marketplace_connections').select('id,marketplace,display_name,external_seller_id,status,connection_mode,capability_tier,last_sync_at,last_sync_status,created_at,updated_at').eq('user_id',user.id).order('created_at',{ascending:false})
    if(error)return json({error:'DB_READ_FAILED'},500,origin)
    return json({connections:data??[],providers:publicProviderCatalog()},200,origin)
  }

  if(req.method==='POST'){
    let body:Record<string,unknown>
    try{body=await req.json()}catch{return json({error:'INVALID_JSON'},400,origin)}
    const marketplace=cleanText(body.marketplace,20)
    const displayName=cleanText(body.display_name,120)
    const sellerId=cleanText(body.external_seller_id,120)
    if(!isMarketplace(marketplace))return json({error:'INVALID_MARKETPLACE'},400,origin)
    const provider=PROVIDERS[marketplace]
    if(!displayName)return json({error:'INVALID_DISPLAY_NAME'},400,origin)
    if(provider.sellerIdRequired&&!sellerId)return json({error:'INVALID_SELLER_ID'},400,origin)
    if(marketplace==='trendyol'&&!/^\d{1,20}$/.test(sellerId))return json({error:'INVALID_SELLER_ID'},400,origin)
    if(marketplace==='hepsiburada'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sellerId))return json({error:'INVALID_HEPSIBURADA_MERCHANT_ID'},400,origin)
    const {data,error}=await admin.from('marketplace_connections').insert({
      user_id:user.id,marketplace,display_name:displayName,external_seller_id:sellerId||null,
      status:'pending',connection_mode:provider.mode,capability_tier:provider.tier
    }).select('id,marketplace,display_name,external_seller_id,status,connection_mode,capability_tier,created_at').single()
    if(error){if(error.code==='23505')return json({error:'CONNECTION_EXISTS'},409,origin);return json({error:'DB_WRITE_FAILED'},500,origin)}
    return json({connection:data,provider:publicProviderCatalog().find(item=>item.key===marketplace)},201,origin)
  }

  if(req.method==='DELETE'){
    const u=new URL(req.url),id=cleanText(u.searchParams.get('id'),80)
    if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:'INVALID_CONNECTION_ID'},400,origin)
    const {data,error}=await admin.from('marketplace_connections').delete().eq('id',id).eq('user_id',user.id).select('id')
    if(error)return json({error:'DB_DELETE_FAILED'},500,origin)
    if(!data?.length)return json({error:'NOT_FOUND'},404,origin)
    return json({deleted:true},200,origin)
  }
  return json({error:'METHOD_NOT_ALLOWED'},405,origin)
})
