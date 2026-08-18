import * as Sentry from 'npm:@sentry/deno@10.70.0'

const DSN=String(Deno.env.get('SENTRY_DSN')||'').trim()
const ENVIRONMENT=String(Deno.env.get('SENTRY_ENVIRONMENT')||'production').trim().slice(0,64)

if(DSN){
  Sentry.init({
    dsn:DSN,
    environment:ENVIRONMENT,
    defaultIntegrations:false,
    sendDefaultPii:false,
    tracesSampleRate:0
  })
}

function tag(value:unknown,max=80){return String(value??'unknown').replace(/[^a-zA-Z0-9_.:-]/g,'_').slice(0,max)}

async function flush(){try{await Sentry.flush(1500)}catch{/* Monitoring must never break the request. */}}

export async function captureMonitoringException(error:unknown,context:{functionName:string;code?:string}){
  if(!DSN)return false
  const safeError=error instanceof Error?error:new Error(tag(error,160))
  Sentry.withScope(scope=>{
    scope.setTag('edge_function',tag(context.functionName))
    scope.setTag('error_code',tag(context.code||'UNHANDLED'))
    scope.setTag('region',tag(Deno.env.get('SB_REGION')))
    Sentry.captureException(safeError)
  })
  await flush()
  return true
}

export async function captureSafeFailure(functionName:string,code:string,cause?:unknown){
  if(!DSN)return false
  if(cause!==undefined)return captureMonitoringException(cause,{functionName,code})
  Sentry.withScope(scope=>{
    scope.setTag('edge_function',tag(functionName))
    scope.setTag('error_code',tag(code))
    scope.setTag('region',tag(Deno.env.get('SB_REGION')))
    Sentry.captureMessage(`${tag(functionName)}:${tag(code)}`,'error')
  })
  await flush()
  return true
}
