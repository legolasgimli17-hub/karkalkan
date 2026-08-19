import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { paddleConfig, paddleReadiness, PLAN_CATALOG, planEntitlements } from '../_shared/billing.ts'

const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'})
function dayKey(value:Date|string|number){
  const date=value instanceof Date?value:new Date(value)
  if(Number.isNaN(date.getTime()))return ''
  const parts=dayFormatter.formatToParts(date),get=(type:string)=>parts.find(part=>part.type===type)?.value||''
  return `${get('year')}-${get('month')}-${get('day')}`
}
function addMonth(day:string){
  const match=day.match(/^(\d{4})-(\d{2})-01$/)
  if(!match)return ''
  const next=new Date(Date.UTC(Number(match[1]),Number(match[2]),1,12))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-01`
}
function usagePeriod(subscription:any,entitled:boolean){
  if(entitled&&subscription?.current_period_start&&subscription?.current_period_end){
    const start=dayKey(subscription.current_period_start),end=dayKey(subscription.current_period_end)
    if(start&&end&&end>start)return {start,end}
  }
  const today=dayKey(new Date()),start=`${today.slice(0,7)}-01`
  return {start,end:addMonth(start)}
}

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
  const effectiveSubscription=subscription||{plan_key:'free',status:'inactive'}
  const entitlement=planEntitlements(effectiveSubscription.plan_key,effectiveSubscription.status)
  const period=usagePeriod(effectiveSubscription,entitlement.entitled)
  const {data:orderUsage,error:orderUsageError}=await auth.admin
    .from('billing_order_usage_daily')
    .select('order_equivalents,basis,day')
    .eq('user_id',auth.user.id)
    .gte('day',period.start)
    .lt('day',period.end)
  if(orderUsageError)return json(500,{error:'DB_READ_FAILED'},origin)
  const stores=count||0
  const ordersUsed=(orderUsage||[]).reduce((sum,row)=>sum+Math.max(0,Number(row.order_equivalents)||0),0)
  const orderUsageBasis=(orderUsage||[]).some(row=>row.basis==='conservative_proxy_units')?'conservative_proxy_units':'conservative_product_orders'
  const configuredPlans=PLAN_CATALOG.map(plan=>({...plan,checkoutConfigured:readiness.configuredPrices[plan.key]}))
  return json(200,{
    billingReady:readiness.ready,
    environment:config.environment,
    subscription:effectiveSubscription,
    usage:{
      stores,
      storeLimit:entitlement.stores,
      canCreateStore:stores<entitlement.stores,
      orders:ordersUsed,
      orderLimit:entitlement.orders,
      canProcessOrders:ordersUsed<entitlement.orders,
      orderUsageBasis,
      orderPeriodStart:period.start,
      orderPeriodEnd:period.end
    },
    entitlement:{planKey:entitlement.planKey,stores:entitlement.stores,orders:entitlement.orders,entitled:entitlement.entitled},
    plans:configuredPlans
  },origin)
})
