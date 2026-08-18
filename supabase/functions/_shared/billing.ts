export type PlanKey='starter'|'growth'|'scale'

export const PLAN_CATALOG=[
  {key:'starter' as PlanKey,name:'Başlangıç',monthlyTry:499,stores:1,orders:500,description:'Kârlılığını ilk kez düzenli takip eden mağazalar için.'},
  {key:'growth' as PlanKey,name:'Büyüme',monthlyTry:899,stores:3,orders:5000,description:'Birden fazla mağaza ve düzenli karar akışı için.'},
  {key:'scale' as PlanKey,name:'Ölçek',monthlyTry:2499,stores:10,orders:50000,description:'Ajanslar ve yüksek hacimli e-ticaret ekipleri için.'}
]

export function paddleConfig(){
  const environment=String(Deno.env.get('PADDLE_ENVIRONMENT')||'sandbox').toLowerCase()==='production'?'production':'sandbox'
  const apiKey=String(Deno.env.get('PADDLE_API_KEY')||'').trim()
  const webhookSecret=String(Deno.env.get('PADDLE_WEBHOOK_SECRET')||'').trim()
  const checkoutUrl=String(Deno.env.get('PADDLE_CHECKOUT_URL')||'https://karkalkan.vercel.app/uygulama#billing').trim()
  const prices:Record<PlanKey,string>={
    starter:String(Deno.env.get('PADDLE_PRICE_STARTER_MONTHLY')||'').trim(),
    growth:String(Deno.env.get('PADDLE_PRICE_GROWTH_MONTHLY')||'').trim(),
    scale:String(Deno.env.get('PADDLE_PRICE_SCALE_MONTHLY')||'').trim()
  }
  return {environment,apiKey,webhookSecret,checkoutUrl,prices,baseUrl:environment==='production'?'https://api.paddle.com':'https://sandbox-api.paddle.com'}
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
