export type PlanKey='starter'|'growth'|'scale'
export type BillingStatus='inactive'|'trialing'|'active'|'past_due'|'paused'|'canceled'

export const PLAN_CATALOG=[
  {key:'starter' as PlanKey,name:'Başlangıç',monthlyTry:499,stores:1,orders:500,description:'Kârlılığını ilk kez düzenli takip eden mağazalar için.'},
  {key:'growth' as PlanKey,name:'Büyüme',monthlyTry:899,stores:3,orders:5000,description:'Birden fazla mağaza ve düzenli karar akışı için.'},
  {key:'scale' as PlanKey,name:'Ölçek',monthlyTry:2499,stores:10,orders:50000,description:'Ajanslar ve yüksek hacimli e-ticaret ekipleri için.'}
]

const ENTITLED_STATUSES=new Set<BillingStatus>(['trialing','active','past_due'])
const PADDLE_PRICE_ID=/^pri_[a-z0-9]{26}$/

export function planEntitlements(planKey:unknown,status:unknown){
  const normalizedPlan=String(planKey||'free')
  const normalizedStatus=String(status||'inactive') as BillingStatus
  const plan=PLAN_CATALOG.find(item=>item.key===normalizedPlan)
  if(!plan||!ENTITLED_STATUSES.has(normalizedStatus))return {planKey:'free' as const,stores:0,orders:0,entitled:false}
  return {planKey:plan.key,stores:plan.stores,orders:plan.orders,entitled:true}
}

const positiveInteger=(value:string,fallback:number,min:number,max:number)=>{const parsed=Number(value);return Number.isInteger(parsed)&&parsed>=min&&parsed<=max?parsed:fallback}

function validCheckoutUrl(value:string){
  try{
    const url=new URL(value)
    return url.protocol==='https:'&&!url.username&&!url.password
  }catch{return false}
}

export function paddleConfig(){
  const environment=String(Deno.env.get('PADDLE_ENVIRONMENT')||'sandbox').toLowerCase()==='production'?'production':'sandbox'
  const apiKey=String(Deno.env.get('PADDLE_API_KEY')||'').trim()
  const webhookSecret=String(Deno.env.get('PADDLE_WEBHOOK_SECRET')||'').trim()
  const checkoutUrl=String(Deno.env.get('PADDLE_CHECKOUT_URL')||'https://karkalkan.vercel.app/uygulama#billing').trim()
  const webhookToleranceSeconds=positiveInteger(String(Deno.env.get('PADDLE_WEBHOOK_TOLERANCE_SECONDS')||''),5,5,120)
  const prices:Record<PlanKey,string>={
    starter:String(Deno.env.get('PADDLE_PRICE_STARTER_MONTHLY')||'').trim(),
    growth:String(Deno.env.get('PADDLE_PRICE_GROWTH_MONTHLY')||'').trim(),
    scale:String(Deno.env.get('PADDLE_PRICE_SCALE_MONTHLY')||'').trim()
  }
  return {environment,apiKey,webhookSecret,checkoutUrl,webhookToleranceSeconds,prices,baseUrl:environment==='production'?'https://api.paddle.com':'https://sandbox-api.paddle.com'}
}

export function paddleReadiness(config=paddleConfig()){
  const missing:string[]=[]
  if(!config.apiKey)missing.push('api_key')
  if(config.webhookSecret.length<20)missing.push('webhook_secret')
  if(!validCheckoutUrl(config.checkoutUrl))missing.push('checkout_url')
  for(const plan of PLAN_CATALOG)if(!PADDLE_PRICE_ID.test(config.prices[plan.key]))missing.push(`price_${plan.key}`)
  return {ready:missing.length===0,missing,configuredPrices:Object.fromEntries(PLAN_CATALOG.map(plan=>[plan.key,PADDLE_PRICE_ID.test(config.prices[plan.key])])) as Record<PlanKey,boolean>}
}

export function isPlanKey(value:string):value is PlanKey{return value==='starter'||value==='growth'||value==='scale'}

export async function paddleRequest(path:string,init:RequestInit={}){
  const config=paddleConfig()
  if(!config.apiKey)throw new Error('BILLING_NOT_CONFIGURED')
  const response=await fetch(`${config.baseUrl}${path}`,{
    ...init,
    headers:{'Authorization':`Bearer ${config.apiKey}`,'Content-Type':'application/json','Paddle-Version':'1',...(init.headers||{})},
    redirect:'error',
    signal:AbortSignal.timeout(15000)
  })
  let payload:any=null
  try{payload=await response.json()}catch{/* Paddle may return an empty error body. */}
  if(!response.ok){const code=String(payload?.error?.code||`PADDLE_HTTP_${response.status}`);throw new Error(code)}
  return payload
}
