import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { paddleConfig, paddleReadiness, PLAN_CATALOG } from '../_shared/billing.ts'

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(req.method!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)
  const config=paddleConfig()
  const readiness=paddleReadiness(config)
  const [{data:subscription,error:subscriptionError},{count,error:countError}]=await Promise.all([
    auth.admin.from('billing_subscriptions').select('plan_key,status,currency,current_period_start,current_period_end,trial_end,scheduled_change,paddle_subscription_id').eq('user_id',auth.user.id).maybeSingle(),
    auth.admin.from('marketplace_connections').select('id',{count:'exact',head:true}).eq('user_id',auth.user.id)
  ])
  if(subscriptionError||countError)return json(500,{error:'DB_READ_FAILED'},origin)
  const configuredPlans=PLAN_CATALOG.map(plan=>({...plan,checkoutConfigured:readiness.configuredPrices[plan.key]}))
  return json(200,{
    billingReady:readiness.ready,
    environment:config.environment,
    subscription:subscription||{plan_key:'free',status:'inactive'},
    usage:{stores:count||0},
    plans:configuredPlans
  },origin)
})
