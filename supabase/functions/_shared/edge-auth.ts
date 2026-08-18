import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||''
const PROJECT_ORIGIN=(()=>{try{return new URL(PROJECT_URL).origin}catch{return ''}})()

export function allowedOrigin(origin:string|null){if(!origin)return true;if(origin==='https://karkalkan.vercel.app'||origin===PROJECT_ORIGIN)return true;try{const u=new URL(origin);return u.protocol==='https:'&&u.hostname.endsWith('-krgzabdullah22-8562s-projects.vercel.app')}catch{return false}}
export function responseHeaders(origin:string|null){const h:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};if(origin&&allowedOrigin(origin)){h['Access-Control-Allow-Origin']=origin;h['Access-Control-Allow-Headers']='authorization, apikey, content-type';h['Access-Control-Allow-Methods']='GET, POST, OPTIONS'}return h}
export function json(status:number,body:unknown,origin:string|null){return new Response(JSON.stringify(body),{status,headers:responseHeaders(origin)})}

export async function authenticate(req:Request){
  const auth=req.headers.get('Authorization')||''
  if(!auth.startsWith('Bearer '))return null
  const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default
  const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default
  if(!PROJECT_URL||!publishable||!secret)throw new Error('SERVER_CONFIG')
  const userClient=createClient(PROJECT_URL,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
  const token=auth.slice(7),{data,error}=await userClient.auth.getUser(token),user=data?.user
  if(error||!user)return null
  const admin=createClient(PROJECT_URL,secret,{auth:{persistSession:false,autoRefreshToken:false}})
  return {user,userClient,admin}
}
