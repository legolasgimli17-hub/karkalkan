import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'})
function allowedOrigin(o:string|null){if(!o)return true;if(o==='https://karkalkan.vercel.app'||o===PROJECT_ORIGIN)return true;try{const u=new URL(o);return u.protocol==='https:'&&u.hostname.endsWith('-krgzabdullah22-8562s-projects.vercel.app')}catch{return false}}
function headers(o:string|null){const h:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};if(o&&allowedOrigin(o)){h['Access-Control-Allow-Origin']=o;h['Access-Control-Allow-Headers']='authorization, apikey, content-type';h['Access-Control-Allow-Methods']='GET, OPTIONS'}return h}
function json(s:number,b:unknown,o:string|null){return new Response(JSON.stringify(b),{status:s,headers:headers(o)})}
function validUuid(v:string){return /^[0-9a-f-]{36}$/i.test(v)}
function n(v:unknown){const x=Number(v);return Number.isFinite(x)?x:0}
function clamp(v:number){return Math.max(0,Math.min(1,v))}
function pct(v:number){return Math.round(clamp(v)*100)}
function money(v:number){return Math.round(v*100)/100}
function dayKey(date:Date){const p=fmt.formatToParts(date),g=(t:string)=>p.find(x=>x.type===t)?.value;return `${g('year')}-${g('month')}-${g('day')}`}
function startDay(days:number){const p=fmt.formatToParts(new Date()),g=(t:string)=>Number(p.find(x=>x.type===t)?.value),mid=Date.UTC(g('year'),g('month')-1,g('day'))-3*60*60*1000;return dayKey(new Date(mid-(days-1)*86400000))}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)})
 if(req.method!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
 const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))return json(401,{error:'UNAUTHORIZED'},origin)
 const pub=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default;if(!PROJECT_URL||!pub)return json(503,{error:'SERVER_CONFIG'},origin)
 const sb=createClient(PROJECT_URL,pub,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}}),{data:ud,error:ue}=await sb.auth.getUser(auth.slice(7));if(ue||!ud?.user)return json(401,{error:'UNAUTHORIZED'},origin)
 const u=new URL(req.url),connectionId=u.searchParams.get('connection_id')||'',raw=Number(u.searchParams.get('days')||30),days=[7,30].includes(raw)?raw:30;if(!validUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
 const {data:conn,error:ce}=await sb.from('marketplace_connections').select('id,last_sync_at,last_sync_status').eq('id',connectionId).maybeSingle();if(ce)return json(500,{error:'DB_ERROR'},origin);if(!conn)return json(404,{error:'NOT_FOUND'},origin)
 const start=startDay(days)
 const [{data:products,error:pe},{data:daily,error:de},{data:alloc,error:ae},{data:runs,error:re},{data:live,error:le}]=await Promise.all([
  sb.from('marketplace_product_daily_metrics').select('gross_sales,known_cogs,sales_unit_basis,return_unit_basis,claim_item_matches,return_proxy_matches').eq('connection_id',connectionId).gte('day',start),
  sb.from('marketplace_daily_financials').select('gross_sales,gross_returns,commission_cost,settlement_adjustment_net,platform_service_fee_cost,cargo_cost,stoppage_net,seller_revenue').eq('connection_id',connectionId).gte('day',start),
  sb.from('marketplace_product_cargo_allocations').select('allocated_amount').eq('connection_id',connectionId).gte('invoice_day',start),
  sb.from('marketplace_sync_runs').select('result_summary,status,finished_at').eq('connection_id',connectionId).order('started_at',{ascending:false}).limit(1),
  sb.from('marketplace_webhooks').select('status').eq('connection_id',connectionId).maybeSingle()
 ])
 if(pe||de||ae||re||le)return json(500,{error:'DB_ERROR'},origin)
 const rows=products||[],dayRows=daily||[]
 const totalGross=rows.reduce((s:any,r:any)=>s+Math.max(0,n(r.gross_sales)),0),costGross=rows.reduce((s:any,r:any)=>s+(r.known_cogs===null?0:Math.max(0,n(r.gross_sales))),0)
 const productCount=rows.length,exactSales=rows.filter((r:any)=>r.sales_unit_basis==='order_v2_quantity').length
 const claim=rows.reduce((s:any,r:any)=>s+n(r.claim_item_matches),0),proxy=rows.reduce((s:any,r:any)=>s+n(r.return_proxy_matches),0)
 const salesEvidence=productCount?exactSales/productCount:0,returnEvidence=(claim+proxy)>0?claim/(claim+proxy):1,costCoverage=totalGross>0?costGross/totalGross:0
 const cargoCost=dayRows.reduce((s:any,r:any)=>s+n(r.cargo_cost),0),allocated=(alloc||[]).reduce((s:any,r:any)=>s+n(r.allocated_amount),0),cargoCoverage=cargoCost>0?clamp(allocated/cargoCost):1
 const summary:any=runs?.[0]?.result_summary||{},unclassified=Math.max(0,n(summary.unclassifiedAdjustmentRows)),adjustmentImported=Math.max(0,n(summary.adjustmentImported)),classification=adjustmentImported>0?clamp(1-unclassified/adjustmentImported):1
 const syncFresh=conn.last_sync_at?clamp(1-(Date.now()-new Date(conn.last_sync_at).getTime())/(72*60*60*1000)):0
 const components=[
  {key:'salesEvidence',label:'Satış kanıtı',score:pct(salesEvidence),weight:25,help:'Ürün adetlerinin sipariş satırlarıyla doğrulanma düzeyi.'},
  {key:'returnEvidence',label:'İade kanıtı',score:pct(returnEvidence),weight:15,help:'İadelerin kabul edilmiş claim kayıtlarıyla doğrulanma düzeyi.'},
  {key:'costCoverage',label:'Maliyet kapsamı',score:pct(costCoverage),weight:25,help:'Satış hacminin ürün maliyeti bilinen bölümü.'},
  {key:'cargoCoverage',label:'Kargo eşleşmesi',score:pct(cargoCoverage),weight:15,help:'Kargo faturasının ürünlere kanıtlı dağıtılabilen bölümü.'},
  {key:'classification',label:'Kesinti sınıflandırması',score:pct(classification),weight:10,help:'Hakediş düzeltmelerinin tanınan finans türlerine ayrılma düzeyi.'},
  {key:'freshness',label:'Veri güncelliği',score:pct(syncFresh),weight:10,help:'Son doğrulama senkronunun güncelliği.'}
 ]
 const health=Math.round(components.reduce((s,c)=>s+c.score*c.weight,0)/components.reduce((s,c)=>s+c.weight,0))
 const totals=dayRows.reduce((a:any,r:any)=>{a.gross+=n(r.gross_sales);a.returns+=n(r.gross_returns);a.commission+=n(r.commission_cost);a.adjust+=n(r.settlement_adjustment_net);a.platform+=n(r.platform_service_fee_cost);a.cargo+=n(r.cargo_cost);a.stoppage+=n(r.stoppage_net);a.revenue+=n(r.seller_revenue);return a},{gross:0,returns:0,commission:0,adjust:0,platform:0,cargo:0,stoppage:0,revenue:0})
 const leaks:any[]=[]
 if(costCoverage<.9)leaks.push({key:'missing_cost',severity:costCoverage<.5?'high':'medium',title:'Maliyet kör noktası',impactBasis:money(totalGross-costGross),message:`Satış hacminin %${100-pct(costCoverage)} bölümünde ürün maliyeti eksik; bu bölüm için kâr sonucu güvenilir değil.`})
 if(cargoCoverage<.9&&cargoCost>0)leaks.push({key:'cargo_gap',severity:cargoCoverage<.6?'high':'medium',title:'Kargo dağıtım boşluğu',impactBasis:money(Math.max(0,cargoCost-allocated)),message:`Kargo maliyetinin %${100-pct(cargoCoverage)} bölümü ürüne kanıtlı bağlanamadı.`})
 if(unclassified>0)leaks.push({key:'unclassified_adjustment',severity:'high',title:'Tanımsız hakediş hareketi',impactBasis:null,message:`Son senkronda ${unclassified} finans hareketi mevcut sınıflandırma kurallarıyla tanınmadı; sessizce normal kabul edilmedi.`})
 if(returnEvidence<.8)leaks.push({key:'return_proxy',severity:'medium',title:'İade kanıtı zayıf',impactBasis:money(totals.returns),message:`İade eşleşmesinin %${100-pct(returnEvidence)} bölümü doğrudan kabul edilmiş claim kanıtına dayanmıyor.`})
 if(syncFresh<.6)leaks.push({key:'stale_sync',severity:'medium',title:'Doğrulama gecikmiş',impactBasis:null,message:'Son finansal doğrulama güncel değil; canlı sipariş sinyali olsa bile hakediş gerçeği için senkron gerekli.'})
 return json(200,{connectionId,rangeDays:days,startDay:start,healthScore:health,healthLabel:health>=85?'Güçlü':health>=70?'İyi':health>=50?'Eksik veri var':'Dikkat gerekli',components,moneyLeakRadar:leaks,liveSignal:live?.status==='active',lastSyncAt:conn.last_sync_at,lastSyncStatus:conn.last_sync_status,totals:{grossSales:money(totals.gross),grossReturns:money(totals.returns),commissionCost:money(totals.commission),settlementAdjustmentNet:money(totals.adjust),platformServiceFeeCost:money(totals.platform),cargoCost:money(totals.cargo),stoppageNet:money(totals.stoppage),sellerRevenue:money(totals.revenue)},engine:'explainable_score_v1',disclaimer:'Skor ve radar açıklanabilir veri kalitesi/finans sinyalleridir; muhasebe görüşü veya resmî net kâr değildir.'},origin)
})
