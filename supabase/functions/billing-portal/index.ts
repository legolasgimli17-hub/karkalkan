import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { paddleConfig, paddleRequest } from '../_shared/billing.ts'

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)
  const config=paddleConfig()
  if(!config.apiKey)return json(503,{error:'BILLING_NOT_CONFIGURED'},origin)
  const [{data:customer},{data:subscription}]=await Promise.all([
    auth.admin.from('billing_customers').select('paddle_customer_id').eq('user_id',auth.user.id).maybeSingle(),
    auth.admin.from('billing_subscriptions').select('paddle_subscription_id').eq('user_id',auth.user.id).maybeSingle()
  ])
  const customerId=String(customer?.paddle_customer_id||'')
  if(!/^ctm_[a-z0-9]{26}$/.test(customerId))return json(404,{error:'BILLING_CUSTOMER_NOT_FOUND'},origin)
  const subscriptionId=String(subscription?.paddle_subscription_id||'')
  try{
    const requestBody=/^sub_[a-z0-9]{26}$/.test(subscriptionId)?{subscription_ids:[subscriptionId]}:{}
    const payload=await paddleRequest(`/customers/${encodeURIComponent(customerId)}/portal-sessions`,{method:'POST',body:JSON.stringify(requestBody)})
    const portalUrl=String(payload?.data?.urls?.general?.overview||'')
    if(!portalUrl.startsWith('https://'))return json(502,{error:'PADDLE_PORTAL_URL_MISSING'},origin)
    return json(201,{portalUrl},origin)
  }catch(error){return json(502,{error:String((error as Error)?.message||'PADDLE_ERROR')},origin)}
})
