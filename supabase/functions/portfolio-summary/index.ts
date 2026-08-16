import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'})
function allowedOrigin(o:string|null){if(!o)return true;if(o==='https://karkalkan.vercel.app'||o===PROJECT_ORIGIN)return true;try{const u=new URL(o);return u.protocol==='https:'&&u.hostname.endsWith('-krgzabdullah22-8562s-projects.vercel.app')}catch{return false}}
function headers(o:string|null){const h:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};if(o&&allowedOrigin(o)){h['Access-Control-Allow-Origin']=o;h['Access-Control-Allow-Headers']='authorization, apikey, content-type';h['Access-Control-Allow-Methods']='GET, OPTIONS'}return h}
function json(s:number,b:unknown,o:string|null){return new Response(JSON.stringify(b),{status:s,headers:headers(o)})}
function n(v:unknown){const x=Number(v);return Number.isFinite(x)?x:0}
function money(v:number){return Math.round(v*100)/100}
function dayKey(date:Date){const p=fmt.formatToParts(date),g=(t:string)=>p.find(x=>x.type===t)?.value;return `${g('year')}-${g('month')}-${g('day')}`}
function range(days:number){const p=fmt.formatToParts(new Date()),g=(t:string)=>Number(p.find(x=>x.type===t)?.value),today=Date.UTC(g('year'),g('month')-1,g('day'))-3*60*60*1000;return{start:dayKey(new Date(today-(days-1)*86400000)),end:dayKey(new Date(today))}}
function utcDay(v:string){return Date.parse(`${v}T00:00:00Z`)}
function overlapShare(start:string,end:string,expenseStart:string,expenseEnd:string){const s=Math.max(utcDay(start),utcDay(expenseStart)),e=Math.min(utcDay(end),utcDay(expenseEnd));if(e<s)return 0;const overlap=(e-s)/86400000+1,total=(utcDay(expenseEnd)-utcDay(expenseStart))/86400000+1;return total>0?overlap/total:0}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)})
 if(req.method!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
 const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return json(401,{error:'UNAUTHORIZED'},origin)
 const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default;if(!PROJECT_URL||!pub)return json(503,{error:'SERVER_CONFIG'},origin)
 const sb=createClient(PROJECT_URL,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),{data:ud,error:ue}=await sb.auth.getUser(auth.slice(7));if(ue||!ud?.user)return json(401,{error:'UNAUTHORIZED'},origin)
 const u=new URL(req.url),raw=Number(u.searchParams.get('days')||30),days=[7,30].includes(raw)?raw:30,{start,end}=range(days)
 const [{data:connections,error:ce},{data:daily,error:de},{data:expenses,error:ee}]=await Promise.all([
   sb.from('marketplace_connections').select('id,marketplace,display_name,external_seller_id,status,last_sync_at,last_sync_status').order('created_at',{ascending:true}),
   sb.from('marketplace_daily_financials').select('connection_id,gross_sales,gross_returns,commission_cost,seller_revenue,settlement_adjustment_net,platform_service_fee_cost,cargo_cost,stoppage_net').gte('day',start).lte('day',end),
   sb.from('marketplace_operating_expenses').select('connection_id,category,amount,period_start,period_end').lte('period_start',end).gte('period_end',start)
 ])
 if(ce||de||ee)return json(500,{error:'DB_ERROR'},origin)
 const byId=new Map<string,any>()
 for(const c of connections||[])byId.set(String(c.id),{...c,grossSales:0,grossReturns:0,commissionCost:0,sellerRevenue:0,settlementAdjustmentNet:0,platformServiceFeeCost:0,cargoCost:0,stoppageNet:0,operatingExpenses:0,expenseByCategory:{}})
 for(const r of daily||[]){const s=byId.get(String(r.connection_id));if(!s)continue;s.grossSales+=n(r.gross_sales);s.grossReturns+=n(r.gross_returns);s.commissionCost+=n(r.commission_cost);s.sellerRevenue+=n(r.seller_revenue);s.settlementAdjustmentNet+=n(r.settlement_adjustment_net);s.platformServiceFeeCost+=n(r.platform_service_fee_cost);s.cargoCost+=n(r.cargo_cost);s.stoppageNet+=n(r.stoppage_net)}
 for(const r of expenses||[]){const s=byId.get(String(r.connection_id));if(!s)continue;const allocated=n(r.amount)*overlapShare(start,end,String(r.period_start),String(r.period_end));s.operatingExpenses+=allocated;const k=String(r.category||'other');s.expenseByCategory[k]=(s.expenseByCategory[k]||0)+allocated}
 const stores=[...byId.values()].map(s=>{const knownCash=s.sellerRevenue+s.settlementAdjustmentNet-s.platformServiceFeeCost-s.cargoCost-s.stoppageNet,afterOperating=knownCash-s.operatingExpenses;return{id:s.id,marketplace:s.marketplace,displayName:s.display_name,sellerId:s.external_seller_id,status:s.status,lastSyncAt:s.last_sync_at,lastSyncStatus:s.last_sync_status,grossSales:money(s.grossSales),grossReturns:money(s.grossReturns),commissionCost:money(s.commissionCost),knownCashAfterFeesAndStoppage:money(knownCash),operatingExpenses:money(s.operatingExpenses),afterOperatingExpenses:money(afterOperating),expenseByCategory:Object.fromEntries(Object.entries(s.expenseByCategory).map(([k,v])=>[k,money(Number(v))]))}})
 const totals=stores.reduce((a:any,s:any)=>{a.grossSales+=s.grossSales;a.grossReturns+=s.grossReturns;a.commissionCost+=s.commissionCost;a.knownCashAfterFeesAndStoppage+=s.knownCashAfterFeesAndStoppage;a.operatingExpenses+=s.operatingExpenses;a.afterOperatingExpenses+=s.afterOperatingExpenses;return a},{grossSales:0,grossReturns:0,commissionCost:0,knownCashAfterFeesAndStoppage:0,operatingExpenses:0,afterOperatingExpenses:0})
 for(const k of Object.keys(totals))totals[k]=money(totals[k])
 return json(200,{rangeDays:days,startDay:start,endDay:end,storeCount:stores.length,stores,totals,semantics:{knownCashAfterFeesAndStoppage:'Platform/settlement verisiyle bilinen nakit görünümü; muhasebe net kârı değildir.',afterOperatingExpenses:'Bilinen nakit görünümünden seçili döneme dağıtılan kullanıcı giderleri çıkarılmıştır; vergi ve muhasebe net kârı değildir.'}},origin)
})
