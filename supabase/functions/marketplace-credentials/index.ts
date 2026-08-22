import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import { createTransactionPool } from '../_shared/postgres.ts'
import { isMarketplace, PROVIDERS } from '../_shared/providers.ts'
import { consumeRateLimit, isUuid, readJsonBody, requestError } from '../_shared/request-security.ts'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()
const dbUrl=Deno.env.get('KARKALKAN_DB_POOLER_URL')||''
const sql=createTransactionPool(dbUrl,{max_lifetime:60})
function allowedOrigin(origin:string|null){if(!origin)return true;if(origin==='https://karkalkan.vercel.app'||origin===PROJECT_ORIGIN)return true;try{const u=new URL(origin);return u.protocol==='https:'&&Boolean(Deno.env.get('KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX'))&&u.hostname.endsWith(String(Deno.env.get('KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX')))}catch{return false}}
function headers(origin:string|null){const h:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};if(origin&&allowedOrigin(origin)){h['Access-Control-Allow-Origin']=origin;h['Access-Control-Allow-Headers']='authorization, apikey, content-type';h['Access-Control-Allow-Methods']='GET, POST, DELETE, OPTIONS'}return h}
function json(status:number,body:unknown,origin:string|null){return new Response(JSON.stringify(body),{status,headers:headers(origin)})}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)})
  if(!['GET','POST','DELETE'].includes(req.method))return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  const auth=req.headers.get('Authorization')||''
  if(!auth.startsWith('Bearer '))return json(401,{error:'UNAUTHORIZED'},origin)
  const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default
  if(!PROJECT_URL||!publishable||!sql)return json(503,{error:'SERVER_CONFIG'},origin)
  const userClient=createClient(PROJECT_URL,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
  const token=auth.slice(7),{data:userData,error:userErr}=await userClient.auth.getUser(token),user=userData?.user
  if(userErr||!user)return json(401,{error:'UNAUTHORIZED'},origin)
  const u=new URL(req.url)
  let connectionId=u.searchParams.get('connection_id')||'',body:Record<string,unknown>={}
  if(req.method==='POST'){try{body=await readJsonBody(req,65_536) as Record<string,unknown>}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}connectionId=String(body.connection_id||'')}
  if(!isUuid(connectionId))return json(400,{error:'INVALID_CONNECTION'},origin)
  const {data:connection,error:connErr}=await userClient.from('marketplace_connections').select('id,marketplace,status').eq('id',connectionId).maybeSingle()
  if(connErr)return json(500,{error:'DB_ERROR'},origin)
  if(!connection||!isMarketplace(connection.marketplace))return json(404,{error:'NOT_FOUND'},origin)
  if(req.method!=='GET'&&!await consumeRateLimit(sql,'marketplace-credentials',`${user.id}:${connectionId}`,20,600))return json(429,{error:'RATE_LIMITED'},origin)
  const provider=PROVIDERS[connection.marketplace]
  if(connection.marketplace==='amazon'){
    const secretName=`kk.amazon.${connectionId}.refresh_token`
    if(req.method==='GET'){
      try{
        const rows=await sql`select name from vault.secrets where name=${secretName} limit 1`
        const configured=rows.length===1
        return json(200,{configured,mode:'oauth',tier:provider.tier,fields:[],...(configured?{}:{actionRequired:provider.note})},origin)
      }catch{return json(500,{error:'VAULT_READ_FAILED'},origin)}
    }
    if(req.method==='DELETE'){
      try{
        await sql.begin(async tx=>{
          await tx`delete from vault.secrets where name=${secretName}`
          await tx`delete from public.amazon_oauth_states where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid`
          await tx`update public.marketplace_connections set external_seller_id=null,status='pending',updated_at=now() where id=${connectionId}::uuid and user_id=${user.id}::uuid`
        })
        return json(200,{deleted:true},origin)
      }catch{return json(500,{error:'VAULT_DELETE_FAILED'},origin)}
    }
    return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  }
  if(!provider.credentialFields.length)return json(200,{configured:false,mode:provider.mode,tier:provider.tier,actionRequired:provider.note,fields:[]},origin)
  const names=provider.credentialFields.map(field=>`kk.${connection.marketplace}.${connectionId}.${field.vaultKey||field.key}`)

  if(req.method==='GET'){
    try{
      const rows=await sql`select name from vault.secrets where name in ${sql(names)}`
      const stored=new Set(rows.map((row:any)=>String(row.name)))
      const configured=names.every(name=>stored.has(name))
      return json(200,{configured,mode:provider.mode,tier:provider.tier,fields:provider.credentialFields.map(field=>({key:field.key,label:field.label,stored:stored.has(`kk.${connection.marketplace}.${connectionId}.${field.vaultKey||field.key}`)})),...(connection.marketplace==='flo'?{actionRequired:provider.note}:{})},origin)
    }catch{return json(500,{error:'VAULT_READ_FAILED'},origin)}
  }

  if(req.method==='DELETE'){
    try{
      await sql.begin(async tx=>{
        await tx`delete from vault.secrets where name in ${tx(names)}`
        await tx`update public.marketplace_connections set status='pending',updated_at=now() where id=${connectionId}::uuid and user_id=${user.id}::uuid`
      })
      return json(200,{deleted:true},origin)
    }catch{return json(500,{error:'VAULT_DELETE_FAILED'},origin)}
  }

  const credentials=body.credentials&&typeof body.credentials==='object'?body.credentials as Record<string,unknown>:{}
  const values=provider.credentialFields.map(field=>{
    const value=typeof credentials[field.key]==='string'?String(credentials[field.key]).trim():''
    return value.length>=3&&value.length<=field.max?value:''
  })
  if(values.some(value=>!value))return json(400,{error:'INVALID_CREDENTIALS'},origin)
  try{
    await sql.begin(async tx=>{
      const existing=await tx`select id,name from vault.secrets where name in ${tx(names)}`
      const byName=new Map(existing.map((row:any)=>[String(row.name),String(row.id)]))
      for(let index=0;index<names.length;index++){
        const name=names[index],value=values[index],field=provider.credentialFields[index],existingId=byName.get(name)
        const description=`KârKalkan ${provider.label} ${field.label}`
        if(existingId)await tx`select vault.update_secret(${existingId}::uuid,${value},${name},${description})`
        else await tx`select vault.create_secret(${value},${name},${description})`
      }
      const nextStatus=connection.marketplace==='flo'?'pending':'connected'
      await tx`update public.marketplace_connections set status=${nextStatus},updated_at=now() where id=${connectionId}::uuid and user_id=${user.id}::uuid`
    })
    return json(200,{configured:true,provider:connection.marketplace,verification:'stored_not_yet_synced',...(connection.marketplace==='flo'?{actionRequired:provider.note}:{})},origin)
  }catch{return json(500,{error:'VAULT_WRITE_FAILED'},origin)}
})
