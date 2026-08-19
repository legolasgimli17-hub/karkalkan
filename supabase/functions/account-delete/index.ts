import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { readJsonBody, requestError } from '../_shared/request-security.ts'
import { captureSafeFailure } from '../_shared/observability.ts'

const BLOCKING_STATUSES=new Set(['trialing','active','past_due','paused'])
const CONFIRMATION='HESABIMI SİL'

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)

  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)

  let body:any
  try{body=await readJsonBody(req,4096)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}
  const confirmation=String(body?.confirmation||'').trim()
  const email=String(body?.email||'').trim().toLowerCase()
  const currentEmail=String(auth.user.email||'').trim().toLowerCase()
  if(confirmation!==CONFIRMATION||!currentEmail||email!==currentEmail)return json(400,{error:'ACCOUNT_DELETE_CONFIRMATION_INVALID'},origin)

  const {data:subscription,error:subscriptionError}=await auth.admin
    .from('billing_subscriptions')
    .select('status,scheduled_change,paddle_subscription_id')
    .eq('user_id',auth.user.id)
    .maybeSingle()
  if(subscriptionError)return json(500,{error:'ACCOUNT_DELETE_PREFLIGHT_FAILED'},origin)
  if(subscription&&BLOCKING_STATUSES.has(String(subscription.status||''))){
    return json(409,{error:'ACCOUNT_DELETE_ACTIVE_SUBSCRIPTION',manageBilling:true},origin)
  }

  try{
    const {error}=await auth.admin.auth.admin.deleteUser(auth.user.id,false)
    if(error){
      const message=String(error.message||'')
      if(/storage|object/i.test(message))return json(409,{error:'ACCOUNT_DELETE_STORAGE_BLOCKED'},origin)
      throw error
    }
    return json(200,{ok:true,deleted:true},origin)
  }catch(error){
    await captureSafeFailure('account-delete','ACCOUNT_DELETE_FAILED',error)
    return json(500,{error:'ACCOUNT_DELETE_FAILED'},origin)
  }
})
