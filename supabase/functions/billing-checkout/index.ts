import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { isPlanKey, paddleConfig, paddleRequest } from '../_shared/billing.ts'

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)
  let body:Record<string,unknown>
  try{body=await req.json()}catch{return json(400,{error:'INVALID_JSON'},origin)}
  const planKey=String(body.plan||'')
  if(!isPlanKey(planKey))return json(400,{error:'INVALID_PLAN'},origin)
  const config=paddleConfig(),priceId=config.prices[planKey]
  if(!config.apiKey||!priceId)return json(503,{error:'BILLING_NOT_CONFIGURED'},origin)
  const {data:existing}=await auth.admin.from('billing_subscriptions').select('status,paddle_subscription_id').eq('user_id',auth.user.id).maybeSingle()
  if(existing&&['active','trialing','past_due','paused'].includes(existing.status))return json(409,{error:'SUBSCRIPTION_ALREADY_EXISTS',manageInstead:true},origin)
  try{
    const payload=await paddleRequest('/transactions',{method:'POST',body:JSON.stringify({
      items:[{price_id:priceId,quantity:1}],
      collection_mode:'automatic',
      custom_data:{user_id:auth.user.id,plan_key:planKey,product:'karkalkan'},
      checkout:{url:config.checkoutUrl}
    })})
    const checkoutUrl=String(payload?.data?.checkout?.url||'')
    if(!checkoutUrl.startsWith('https://'))return json(502,{error:'PADDLE_CHECKOUT_URL_MISSING'},origin)
    return json(201,{checkoutUrl,transactionId:payload?.data?.id,environment:config.environment},origin)
  }catch(error){return json(502,{error:String((error as Error)?.message||'PADDLE_ERROR')},origin)}
})
