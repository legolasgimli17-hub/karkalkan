import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
function allowedOrigin(o:string|null){if(!o)return true;if(o==='https://karkalkan.vercel.app'||o===PROJECT_ORIGIN)return true;try{const u=new URL(o);return u.protocol==='https:'&&u.hostname.endsWith('-krgzabdullah22-8562s-projects.vercel.app')}catch{return false}}
function headers(o:string|null){const h:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};if(o&&allowedOrigin(o)){h['Access-Control-Allow-Origin']=o;h['Access-Control-Allow-Headers']='authorization, apikey, content-type';h['Access-Control-Allow-Methods']='GET, OPTIONS'}return h}
function json(s:number,b:unknown,o:string|null){return new Response(JSON.stringify(b),{status:s,headers:headers(o)})}
function validUuid(v:string){return /^[0-9a-f-]{36}$/i.test(v)}
function money(v:unknown){const n=Number(v);return Number.isFinite(n)?Math.round(n*100)/100:0}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin');if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)})
  if(req.method!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return json(401,{error:'UNAUTHORIZED'},origin)
  const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default;if(!PROJECT_URL||!pub)return json(503,{error:'SERVER_CONFIG'},origin)
  const sb=createClient(PROJECT_URL,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),{data:ud,error:ue}=await sb.auth.getUser(auth.slice(7));if(ue||!ud?.user)return json(401,{error:'UNAUTHORIZED'},origin)
  const u=new URL(req.url),connectionId=u.searchParams.get('connection_id')||'';if(!validUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
  const {data:conn,error:ce}=await sb.from('marketplace_connections').select('id').eq('id',connectionId).maybeSingle();if(ce)return json(500,{error:'DB_ERROR'},origin);if(!conn)return json(404,{error:'NOT_FOUND'},origin)
  const since=new Date(Date.now()-24*60*60*1000).toISOString()
  const [{data:hook,error:he},{data:orders,error:oe},{data:events,error:ee}]=await Promise.all([
    sb.from('marketplace_webhooks').select('status,registered_at,updated_at,subscribed_statuses').eq('connection_id',connectionId).maybeSingle(),
    sb.from('marketplace_live_orders').select('package_id,order_number,status,event_at,total_amount,line_count').eq('connection_id',connectionId).order('event_at',{ascending:false}).limit(24),
    sb.from('marketplace_order_events').select('status,event_at,total_amount').eq('connection_id',connectionId).gte('event_at',since).order('event_at',{ascending:true}).limit(500)
  ])
  if(he||oe||ee)return json(500,{error:'DB_ERROR'},origin)
  const byHour=new Map<string,{hour:string,count:number,amount:number}>(),statusCounts:Record<string,number>={}
  for(const e of events||[]){const d=new Date(e.event_at);if(Number.isNaN(d.getTime()))continue;d.setMinutes(0,0,0);const k=d.toISOString();const x=byHour.get(k)||{hour:k,count:0,amount:0};x.count++;x.amount+=money(e.total_amount);byHour.set(k,x);const s=String(e.status||'UNKNOWN');statusCounts[s]=(statusCounts[s]||0)+1}
  const current=(orders||[]).reduce((a:any,r:any)=>{a.count++;a.amount+=money(r.total_amount);return a},{count:0,amount:0})
  return json(200,{configured:!!hook,webhook:hook||null,last24Hours:{events:(events||[]).length,statusCounts,series:[...byHour.values()].map(x=>({...x,amount:money(x.amount)}))},liveOrders:{count:current.count,visibleAmount:money(current.amount),rows:orders||[]},model:'signal_then_reconcile'},origin)
})
