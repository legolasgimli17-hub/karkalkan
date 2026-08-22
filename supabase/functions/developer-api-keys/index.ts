import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { createTransactionPool } from '../_shared/postgres.ts'
import { readJsonBody, requestError } from '../_shared/request-security.ts'

const sql=createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL')||'')
const ALLOWED_SCOPES=new Set(['finance:read','products:read','connections:read'])
const MAX_ACTIVE_KEYS=5

function clean(value:unknown,max:number){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)}
function isUuid(value:unknown){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))}
function base64url(bytes:Uint8Array){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function makeSecret(){return `kk_live_${base64url(crypto.getRandomValues(new Uint8Array(32)))}`}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function scopes(value:unknown){if(!Array.isArray(value))return ['finance:read','products:read','connections:read'];const out=[...new Set(value.map(item=>clean(item,40)).filter(item=>ALLOWED_SCOPES.has(item)))];return out.length?out:[]}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(!['GET','POST'].includes(req.method))return json(405,{error:'METHOD_NOT_ALLOWED'},origin)
  if(!sql)return json(503,{error:'SERVER_CONFIG'},origin)

  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)

  if(req.method==='GET'){
    const rows=await sql`select id,name,key_prefix,scopes,expires_at,last_used_at,revoked_at,created_at,updated_at from public.developer_api_keys where user_id=${auth.user.id}::uuid order by created_at desc limit 20`
    return json(200,{keys:rows.map((row:any)=>({id:row.id,name:row.name,prefix:row.key_prefix,scopes:row.scopes,expiresAt:row.expires_at,lastUsedAt:row.last_used_at,revokedAt:row.revoked_at,createdAt:row.created_at,updatedAt:row.updated_at}))},origin)
  }

  let body:any
  try{body=await readJsonBody(req,16*1024)}catch(error){const failure=requestError(error);return json(failure.status,{error:failure.code},origin)}
  const action=clean(body?.action||'create',20)

  if(action==='revoke'){
    const id=clean(body?.id,36)
    if(!isUuid(id))return json(400,{error:'INVALID_KEY_ID'},origin)
    const rows=await sql`update public.developer_api_keys set revoked_at=coalesce(revoked_at,now()),updated_at=now() where id=${id}::uuid and user_id=${auth.user.id}::uuid returning id,revoked_at`
    if(!rows.length)return json(404,{error:'NOT_FOUND'},origin)
    return json(200,{ok:true,id:rows[0].id,revokedAt:rows[0].revoked_at},origin)
  }

  if(action!=='create')return json(400,{error:'INVALID_ACTION'},origin)
  const name=clean(body?.name,80)
  const requestedScopes=scopes(body?.scopes)
  const expiresInDays=body?.expires_in_days==null?90:Number(body.expires_in_days)
  if(!name)return json(400,{error:'NAME_REQUIRED'},origin)
  if(!requestedScopes.length)return json(400,{error:'INVALID_SCOPES'},origin)
  if(!Number.isInteger(expiresInDays)||expiresInDays<1||expiresInDays>365)return json(400,{error:'INVALID_EXPIRY'},origin)

  const active=await sql`select count(*)::int as count from public.developer_api_keys where user_id=${auth.user.id}::uuid and revoked_at is null and (expires_at is null or expires_at>now())`
  if(Number(active[0]?.count||0)>=MAX_ACTIVE_KEYS)return json(409,{error:'API_KEY_LIMIT',limit:MAX_ACTIVE_KEYS},origin)

  const secret=makeSecret(),hash=await sha256(secret),prefix=secret.slice(0,18)
  const rows=await sql`insert into public.developer_api_keys(user_id,name,key_prefix,key_hash,scopes,expires_at) values(${auth.user.id}::uuid,${name},${prefix},${hash},${requestedScopes},now()+(${expiresInDays}::text||' days')::interval) returning id,name,key_prefix,scopes,expires_at,created_at`
  const row=rows[0]
  return json(201,{key:{id:row.id,name:row.name,prefix:row.key_prefix,scopes:row.scopes,expiresAt:row.expires_at,createdAt:row.created_at},secret,warning:'Bu anahtar yalnızca şimdi gösterilir. Sunucu tarafında saklayın; tarayıcı koduna koymayın.'},origin)
})
