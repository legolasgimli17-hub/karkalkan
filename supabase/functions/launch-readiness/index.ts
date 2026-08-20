import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { paddleConfig, paddleReadiness } from '../_shared/billing.ts'

const VALIDATED_STATUSES=new Set(['active','trialing','past_due'])

function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get('Origin')
  if(!allowedOrigin(origin))return json(403,{error:'ORIGIN_NOT_ALLOWED'},origin)
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:responseHeaders(origin)})
  if(req.method!=='GET')return json(405,{error:'METHOD_NOT_ALLOWED'},origin)

  let auth
  try{auth=await authenticate(req)}catch{return json(503,{error:'SERVER_CONFIG'},origin)}
  if(!auth)return json(401,{error:'UNAUTHORIZED'},origin)

  const config=paddleConfig(),billingConfig=paddleReadiness(config)
  const [
    {data:trendyolConnections,error:connectionError},
    {data:successfulRuns,error:runError},
    {data:evidence,error:evidenceError},
    {data:billingEvents,error:eventError},
    {data:billingSubscriptions,error:subscriptionError}
  ]=await Promise.all([
    auth.admin.from('marketplace_connections').select('id,status,last_sync_at,last_sync_status').eq('user_id',auth.user.id).eq('marketplace','trendyol'),
    auth.admin.from('marketplace_sync_runs').select('connection_id,status,range_start,range_end,finished_at').eq('user_id',auth.user.id).eq('status','success').order('finished_at',{ascending:false}).limit(20),
    auth.admin.from('marketplace_validation_evidence').select('connection_id,status,period_start,period_end,updated_at').eq('user_id',auth.user.id).eq('marketplace','trendyol').order('updated_at',{ascending:false}).limit(20),
    auth.admin.from('billing_events').select('event_type,safe_error_code').is('safe_error_code',null).limit(500),
    auth.admin.from('billing_subscriptions').select('status,paddle_subscription_id,updated_at').limit(100)
  ])
  if(connectionError||runError||evidenceError||eventError||subscriptionError)return json(500,{error:'DB_READ_FAILED'},origin)

  const connectionIds=new Set((trendyolConnections||[]).map((row:any)=>String(row.id)))
  const hasSuccessfulSync=(successfulRuns||[]).some((row:any)=>connectionIds.has(String(row.connection_id)))
  const matchedEvidence=(evidence||[]).find((row:any)=>row.status==='matched'&&connectionIds.has(String(row.connection_id)))||null
  const hasConnectedStore=(trendyolConnections||[]).some((row:any)=>row.status==='connected'||row.last_sync_status==='success')

  const eventTypes=new Set((billingEvents||[]).map((row:any)=>String(row.event_type||'')))
  const hasSubscriptionWebhook=[...eventTypes].some(type=>type.startsWith('subscription.'))
  const hasTransactionCompletion=eventTypes.has('transaction.completed')||eventTypes.has('transaction.paid')
  const hasLiveSubscription=(billingSubscriptions||[]).some((row:any)=>VALIDATED_STATUSES.has(String(row.status||''))&&String(row.paddle_subscription_id||''))
  const billingProven=Boolean(billingConfig.ready&&config.environment==='production'&&hasSubscriptionWebhook&&hasLiveSubscription)

  const legalOperator=String(Deno.env.get('KARKALKAN_LEGAL_OPERATOR_NAME')||'').trim()
  const legalContact=String(Deno.env.get('KARKALKAN_LEGAL_CONTACT_EMAIL')||'').trim().toLowerCase()
  const legalApprovedAt=String(Deno.env.get('KARKALKAN_LEGAL_APPROVED_AT')||'').trim()
  const legalApproved=Boolean(legalOperator&&validEmail(legalContact)&&/^\d{4}-\d{2}-\d{2}/.test(legalApprovedAt))

  const trendYolProven=Boolean(matchedEvidence)
  return json(200,{
    readyForAi:trendYolProven&&billingProven&&legalApproved,
    gates:{
      trendyol:{
        ready:trendYolProven,
        connectionCount:(trendyolConnections||[]).length,
        connected:hasConnectedStore,
        successfulSync:hasSuccessfulSync,
        matchedReconciliation:Boolean(matchedEvidence),
        latestMatchedPeriod:matchedEvidence?{start:matchedEvidence.period_start,end:matchedEvidence.period_end,updatedAt:matchedEvidence.updated_at}:null,
        nextAction:!connectionIds.size?'CONNECT_REAL_TRENDYOL_STORE':!hasSuccessfulSync?'RUN_FULL_TRENDYOL_SYNC':!matchedEvidence?'RECONCILE_CLOSED_7_DAY_PERIOD':'DONE'
      },
      billing:{
        ready:billingProven,
        configured:billingConfig.ready,
        environment:config.environment,
        productionEnvironment:config.environment==='production',
        subscriptionWebhookSeen:hasSubscriptionWebhook,
        transactionCompletionSeen:hasTransactionCompletion,
        liveSubscriptionSeen:hasLiveSubscription,
        nextAction:!billingConfig.ready?'CONFIGURE_PADDLE':config.environment!=='production'?'SWITCH_PADDLE_TO_PRODUCTION':!hasSubscriptionWebhook||!hasLiveSubscription?'COMPLETE_REAL_CHECKOUT':'DONE'
      },
      legal:{
        ready:legalApproved,
        operatorConfigured:Boolean(legalOperator),
        applicationChannelConfigured:validEmail(legalContact),
        approvedAtConfigured:/^\d{4}-\d{2}-\d{2}/.test(legalApprovedAt),
        nextAction:legalApproved?'DONE':'COMPLETE_OPERATOR_AND_LEGAL_SIGNOFF'
      }
    }
  },origin)
})
