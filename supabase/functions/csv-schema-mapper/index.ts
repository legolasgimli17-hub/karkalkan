import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { createTransactionPool } from '../_shared/postgres.ts'
import { consumeRateLimit, readJsonBody, requestError } from '../_shared/request-security.ts'

const sql=createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL')||'',{max_lifetime:60})
const MAX_COLUMNS=40
const CANONICAL=['day','external_product_id','sku','product_name','sales_units','return_units','gross_sales','gross_returns','commission_cost','discount_cost','coupon_cost','seller_revenue'] as const
type Target=typeof CANONICAL[number]
type Column={name:string;numericRatio:number;dateRatio:number;nonEmptyRatio:number}
type Suggestion={source:string;target:Target|null;confidence:number;reason:string}

const SYNONYMS:Record<Target,string[]>={
  day:['day','date','tarih','islem tarihi','işlem tarihi','siparis tarihi','sipariş tarihi','order date','transaction date','settlement date','payment date'],
  external_product_id:['external product id','product id','urun id','ürün id','barcode','barkod','merchant sku','stok kodu','stock code','item id','listing id'],
  sku:['sku','merchant sku','stok kodu','stock code','stockcode','seller sku','model kodu'],
  product_name:['product name','urun adi','ürün adı','urun ismi','ürün ismi','title','product title','item name'],
  sales_units:['sales units','units sold','quantity','qty','adet','satis adedi','satış adedi','siparis adedi','sipariş adedi','sold quantity'],
  return_units:['return units','returned units','return quantity','iade adedi','iade adet','returned quantity'],
  gross_sales:['gross sales','sales','brut satis','brüt satış','satis tutari','satış tutarı','gross revenue','revenue','sales amount'],
  gross_returns:['gross returns','returns','iade tutari','iade tutarı','refund amount','refunded amount','return amount'],
  commission_cost:['commission','commission cost','komisyon','komisyon tutari','komisyon tutarı','commission fee','marketplace commission'],
  discount_cost:['discount','discount cost','indirim','indirim tutari','indirim tutarı','seller discount','discount amount'],
  coupon_cost:['coupon','coupon cost','kupon','kupon tutari','kupon tutarı','coupon amount','voucher'],
  seller_revenue:['seller revenue','net revenue','hak edis','hakediş','hakedis','merchant revenue','payout','net amount','net tutar','satici hak edisi','satıcı hakedişi']
}
const SENSITIVE_HEADER=/customer|musteri|müşteri|email|e-mail|telefon|phone|address|adres|iban|hesap no|account number|tc kimlik|tckn|vkn|tax id|vergi no/i

function clean(value:unknown,max=80){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)}
function norm(value:string){return value.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[_\-./]+/g,' ').replace(/\s+/g,' ').trim()}
function clamp(value:unknown){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0}
function score(source:string,target:Target,column:Column){
  if(SENSITIVE_HEADER.test(source))return 0
  const s=norm(source),aliases=SYNONYMS[target].map(norm)
  let value=0
  for(const alias of aliases){if(s===alias)value=Math.max(value,.98);else if(s.includes(alias)||alias.includes(s))value=Math.max(value,.82)}
  if(target==='day'&&column.dateRatio>.7)value=Math.max(value,.62)
  if(['sales_units','return_units','gross_sales','gross_returns','commission_cost','discount_cost','coupon_cost','seller_revenue'].includes(target)&&column.numericRatio>.85)value+=.05
  return Math.min(.99,value)
}
function deterministic(columns:Column[]){
  const used=new Set<Target>(),suggestions:Suggestion[]=[]
  for(const column of columns){
    if(SENSITIVE_HEADER.test(column.name)){suggestions.push({source:column.name,target:null,confidence:1,reason:'Kişisel/hassas veri olabilecek kolon finans şemasına otomatik eşlenmez.'});continue}
    let best:Target|null=null,bestScore=0
    for(const target of CANONICAL){if(used.has(target))continue;const current=score(column.name,target,column);if(current>bestScore){best=target;bestScore=current}}
    if(best&&bestScore>=.62){used.add(best);suggestions.push({source:column.name,target:best,confidence:Math.round(bestScore*100)/100,reason:bestScore>=.9?'Kolon adı güçlü eşleşiyor.':'Kolon adı ve veri tipi birlikte eşleşiyor.'})}
    else suggestions.push({source:column.name,target:null,confidence:0,reason:'Güvenli otomatik eşleşme bulunamadı; kullanıcı onayı gerekli.'})
  }
  return suggestions
}
function outputSchema(){return {type:'object',additionalProperties:false,required:['mappings'],properties:{mappings:{type:'array',maxItems:MAX_COLUMNS,items:{type:'object',additionalProperties:false,required:['source','target','confidence','reason'],properties:{source:{type:'string',maxLength:80},target:{type:['string','null'],enum:[...CANONICAL,null]},confidence:{type:'number',minimum:0,maximum:1},reason:{type:'string',maxLength:160}}}}}}}
function extractText(payload:any){for(const item of Array.isArray(payload?.output)?payload.output:[])for(const part of Array.isArray(item?.content)?item.content:[])if(part?.type==='output_text'&&typeof part.text==='string')return part.text;return ''}
function validateModel(value:any,columns:Column[],fallback:Suggestion[]){
  if(!Array.isArray(value?.mappings))return null
  const sourceNames=new Set(columns.map(column=>column.name)),targets=new Set<string>(),bySource=new Map(fallback.map(item=>[item.source,item]))
  for(const raw of value.mappings){
    const source=clean(raw?.source),target=raw?.target===null?null:String(raw?.target)
    if(!sourceNames.has(source)||!bySource.has(source)||SENSITIVE_HEADER.test(source)&&target!==null)return null
    if(target!==null&&!CANONICAL.includes(target as Target))return null
    if(target!==null){if(targets.has(target))return null;targets.add(target)}
    bySource.set(source,{source,target:target as Target|null,confidence:Math.round(clamp(raw?.confidence)*100)/100,reason:clean(raw?.reason,160)})
  }
  return columns.map(column=>bySource.get(column.name) as Suggestion)
}
async function readinessAllowsAi(req:Request){
  const projectUrl=Deno.env.get('SUPABASE_URL')||''
  const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default
  const authorization=req.headers.get('Authorization')||''
  if(!projectUrl||!publishable||!authorization)return false
  try{
    const response=await fetch(`${projectUrl}/functions/v1/launch-readiness`,{headers:{apikey:publishable,Authorization:authorization},signal:AbortSignal.timeout(8000)})
    if(!response.ok)return false
    const body=await response.json()
    return body?.readyForAi===true
  }catch{return false}
}
async function improveWithModel(columns:Column[],fallback:Suggestion[],allowed:boolean){
  const apiKey=String(Deno.env.get('OPENAI_API_KEY')||'').trim()
  if(!allowed)return {mappings:fallback,mode:'deterministic' as const,warning:'AI_READINESS_REQUIRED'}
  if(!apiKey)return {mappings:fallback,mode:'deterministic' as const,warning:'AI_NOT_CONFIGURED'}
  const model=clean(Deno.env.get('KARKALKAN_AI_MODEL')||'gpt-5.6-luna',80)||'gpt-5.6-luna'
  const context={canonicalFields:CANONICAL,columns,deterministicSuggestions:fallback}
  const instructions='You map ecommerce finance CSV schemas. You receive column names and aggregate type ratios only, never row values. Map only when meaning is supported. Never map customer identity, email, phone, address, bank account, tax identity or unrelated fields. Use null when uncertain. Never invent a source column. One source and one target may be used at most once.'
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions,input:JSON.stringify(context),text:{format:{type:'json_schema',name:'karkalkan_csv_schema_mapping',strict:true,schema:outputSchema()}}}),signal:AbortSignal.timeout(15000)})
    if(!response.ok)return {mappings:fallback,mode:'deterministic' as const,warning:`AI_HTTP_${response.status}`}
    const payload=await response.json(),text=extractText(payload);let parsed:any
    try{parsed=JSON.parse(text)}catch{return {mappings:fallback,mode:'deterministic' as const,warning:'AI_INVALID_JSON'}}
    const validated=validateModel(parsed,columns,fallback)
    if(!validated)return {mappings:fallback,mode:'deterministic' as const,warning:'AI_MAPPING_VALIDATION_FAILED'}
    return {mappings:validated,mode:'ai_assisted' as const,warning:null,model}
  }catch{return {mappings:fallback,mode:'deterministic' as const,warning:'AI_UNAVAILABLE'}}
}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(req.method!=='POST')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)
  if(!sql)return json(503,{error:'SERVER_MISCONFIGURED'},origin)
  try{if(!(await consumeRateLimit(sql,'csv-schema-mapper',auth.user.id,20,3600)))return json(429,{error:'RATE_LIMITED'},origin)}catch{return json(500,{error:'RATE_LIMIT_FAILED'},origin)}
  let body:any
  try{body=await readJsonBody(req,24*1024)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}
  if(Object.keys(body||{}).sort().join(',')!=='columns')return json(400,{error:'INVALID_PAYLOAD'},origin)
  const columnsRaw=Array.isArray(body?.columns)?body.columns:[]
  if(!columnsRaw.length||columnsRaw.length>MAX_COLUMNS)return json(400,{error:'INVALID_COLUMNS'},origin)
  const columns:Column[]=columnsRaw.map((raw:any)=>({name:clean(raw?.name),numericRatio:clamp(raw?.numericRatio),dateRatio:clamp(raw?.dateRatio),nonEmptyRatio:clamp(raw?.nonEmptyRatio)}))
  if(columns.some(column=>!column.name)||new Set(columns.map(column=>column.name)).size!==columns.length)return json(400,{error:'INVALID_COLUMNS'},origin)
  const fallback=deterministic(columns)
  const result=await improveWithModel(columns,fallback,await readinessAllowsAi(req))
  return json(200,{...result,canonicalFields:CANONICAL,privacy:{rowValuesSentToMapper:false,customerDataSentToModel:false,onlyColumnNamesAndTypeRatios:true,modelStorageRequested:false}},origin)
})
