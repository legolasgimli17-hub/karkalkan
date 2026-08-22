import { allowedOrigin, authenticate, json, responseHeaders } from '../_shared/edge-auth.ts'
import { createTransactionPool } from '../_shared/postgres.ts'
import { consumeRateLimit, isUuid, readJsonBody, requestError } from '../_shared/request-security.ts'
import { resolveSyncRange } from '../_shared/sync-range.ts'
import { deliverOutboundEvent } from '../_shared/outbound-webhooks.ts'

const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const PUBLISHABLE_KEY = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || ''
const sql = createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL') || '', { max_lifetime: 90 })
const CHUNK_DAYS = 3
const MAX_ATTEMPTS = 4

function addDays(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

function buildChunks(startDay: string, endDay: string) {
  const chunks: Array<{ index: number; start: string; end: string }> = []
  let cursor = startDay
  let index = 0
  while (cursor <= endDay) {
    const end = [addDays(cursor, CHUNK_DAYS - 1), endDay].sort()[0]
    chunks.push({ index, start: cursor, end })
    cursor = addDays(end, 1)
    index++
  }
  return chunks
}

function retryable(code: string, status: number) {
  return status === 429 || status >= 500 || [
    'TRENDYOL_RATE_LIMIT', 'TRENDYOL_NETWORK', 'TRENDYOL_BAD_JSON', 'SYNC_IN_PROGRESS',
    'SYNC_FAILED', 'AUXILIARY_INCOMPLETE'
  ].includes(code) || /^TRENDYOL_HTTP_5\d\d$/.test(code)
}

function retryDelaySeconds(attempt: number, code: string) {
  if (code === 'TRENDYOL_RATE_LIMIT') return [15, 30, 90, 180][Math.max(0, attempt - 1)] || 180
  return [5, 15, 45, 120][Math.max(0, attempt - 1)] || 120
}

async function providerCall(name: string, authorization: string, body: Record<string, unknown>) {
  if (!PROJECT_URL || !PUBLISHABLE_KEY) return { ok: false, status: 503, data: { error: 'SERVER_CONFIG' } }
  let response: Response
  try {
    response = await fetch(`${PROJECT_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: authorization,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(125_000)
    })
  } catch {
    return { ok: false, status: 502, data: { error: 'TRENDYOL_NETWORK' } }
  }
  let data: any = {}
  try { data = await response.json() } catch { data = { error: response.ok ? 'INVALID_PROVIDER_RESPONSE' : `HTTP_${response.status}` } }
  return { ok: response.ok, status: response.status, data }
}

function publicJob(job: any, chunk: any = null) {
  return {
    status: String(job?.status || 'unknown'),
    requestedDays: Number(job?.requested_days || 0),
    range: { start: job?.range_start || null, end: job?.range_end || null },
    completedChunks: Number(job?.completed_chunks || 0),
    totalChunks: Number(job?.total_chunks || 0),
    currentChunk: chunk ? {
      index: Number(chunk.chunk_index),
      start: chunk.range_start,
      end: chunk.range_end,
      status: chunk.status,
      attempt: Number(chunk.attempt_count || 0)
    } : null,
    safeErrorCode: job?.safe_error_code || null
  }
}

async function loadActiveJob(userId: string, connectionId: string) {
  const rows = await sql<any[]>`
    select id,user_id,connection_id,requested_days,range_start::text,range_end::text,chunk_days,total_chunks,completed_chunks,status,lease_expires_at,safe_error_code
    from public.marketplace_sync_jobs
    where user_id=${userId}::uuid and connection_id=${connectionId}::uuid
      and status in ('pending','running','retry_wait')
    order by created_at desc limit 1`
  return rows[0] || null
}

async function createJob(userId: string, connectionId: string, days: number) {
  const range = resolveSyncRange({ days }, { allowedDays: [7, 30], maxExplicitDays: CHUNK_DAYS })
  if (!range) throw new Error('INVALID_RANGE')
  const chunks = buildChunks(range.startDay, range.endDay)
  try {
    const rows = await sql<any[]>`
      insert into public.marketplace_sync_jobs(user_id,connection_id,marketplace,requested_days,range_start,range_end,chunk_days,total_chunks,status)
      values(${userId}::uuid,${connectionId}::uuid,'trendyol',${days},${range.startDay}::date,${range.endDay}::date,${CHUNK_DAYS},${chunks.length},'pending')
      returning id,user_id,connection_id,requested_days,range_start::text,range_end::text,chunk_days,total_chunks,completed_chunks,status,lease_expires_at,safe_error_code`
    const job = rows[0]
    for (const chunk of chunks) {
      await sql`
        insert into public.marketplace_sync_job_chunks(job_id,user_id,connection_id,chunk_index,range_start,range_end,status)
        values(${job.id}::uuid,${userId}::uuid,${connectionId}::uuid,${chunk.index},${chunk.start}::date,${chunk.end}::date,'pending')`
    }
    return job
  } catch (error) {
    const existing = await loadActiveJob(userId, connectionId)
    if (existing) return existing
    throw error
  }
}

async function releaseLease(jobId: string, userId: string, leaseToken: string) {
  try {
    await sql`update public.marketplace_sync_jobs set lease_token=null,lease_expires_at=null,updated_at=now()
      where id=${jobId}::uuid and user_id=${userId}::uuid and lease_token=${leaseToken}::uuid`
  } catch {}
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  if (!allowedOrigin(origin)) return json(403, { error: 'ORIGIN_NOT_ALLOWED' }, origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin) })
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' }, origin)

  let auth
  try { auth = await authenticate(req) } catch { return json(503, { error: 'SERVER_CONFIG' }, origin) }
  if (!auth || !sql) return json(auth ? 503 : 401, { error: auth ? 'SERVER_CONFIG' : 'UNAUTHORIZED' }, origin)

  try {
    if (!(await consumeRateLimit(sql, 'trendyol-resumable-sync', auth.user.id, 120, 3600))) return json(429, { error: 'RATE_LIMITED' }, origin)
  } catch { return json(500, { error: 'RATE_LIMIT_FAILED' }, origin) }

  let body: any
  try { body = await readJsonBody(req, 8 * 1024) } catch (error) {
    const failure = requestError(error)
    return json(failure.status, { error: failure.code }, origin)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'connection_id,days') {
    return json(400, { error: 'INVALID_SYNC_JOB_PAYLOAD' }, origin)
  }
  const connectionId = String(body.connection_id || '')
  const days = Number(body.days)
  if (!isUuid(connectionId)) return json(400, { error: 'INVALID_CONNECTION' }, origin)
  if (![7, 30].includes(days)) return json(400, { error: 'INVALID_RANGE' }, origin)

  const { data: connection, error: connectionError } = await auth.userClient
    .from('marketplace_connections')
    .select('id,marketplace,status')
    .eq('id', connectionId)
    .maybeSingle()
  if (connectionError) return json(500, { error: 'DB_ERROR' }, origin)
  if (!connection || connection.marketplace !== 'trendyol') return json(404, { error: 'NOT_FOUND' }, origin)

  let job = await loadActiveJob(auth.user.id, connectionId)
  if (job && Number(job.requested_days) !== days) {
    return json(409, { error: 'SYNC_JOB_RANGE_CONFLICT', job: publicJob(job) }, origin)
  }
  if (!job) {
    try { job = await createJob(auth.user.id, connectionId, days) } catch {
      return json(500, { error: 'SYNC_JOB_CREATE_FAILED' }, origin)
    }
  }

  const leaseToken = crypto.randomUUID()
  const leased = await sql<any[]>`
    update public.marketplace_sync_jobs
    set lease_token=${leaseToken}::uuid,lease_expires_at=now()+interval '5 minutes',status=case when status='pending' then 'running' else status end,
        started_at=coalesce(started_at,now()),updated_at=now()
    where id=${job.id}::uuid and user_id=${auth.user.id}::uuid
      and status in ('pending','running','retry_wait')
      and (lease_expires_at is null or lease_expires_at<now())
    returning id,user_id,connection_id,requested_days,range_start::text,range_end::text,chunk_days,total_chunks,completed_chunks,status,lease_expires_at,safe_error_code`
  if (!leased.length) return json(409, { error: 'SYNC_JOB_BUSY', job: publicJob(job) }, origin)
  job = leased[0]

  try {
    await sql`
      update public.marketplace_sync_job_chunks set status='retry_wait',safe_error_code='STALE_CHUNK_LEASE',next_retry_at=now(),updated_at=now()
      where job_id=${job.id}::uuid and user_id=${auth.user.id}::uuid and status='running' and updated_at<now()-interval '6 minutes'`

    const chunks = await sql<any[]>`
      select id,job_id,chunk_index,range_start::text,range_end::text,status,attempt_count,next_retry_at,safe_error_code
      from public.marketplace_sync_job_chunks
      where job_id=${job.id}::uuid and user_id=${auth.user.id}::uuid and status in ('pending','retry_wait')
      order by chunk_index asc limit 1`
    const chunk = chunks[0]

    if (!chunk) {
      const failed = await sql<any[]>`select count(*)::int as n from public.marketplace_sync_job_chunks where job_id=${job.id}::uuid and user_id=${auth.user.id}::uuid and status='failed'`
      if (Number(failed[0]?.n || 0) > 0) {
        await sql`update public.marketplace_sync_jobs set status='failed',finished_at=coalesce(finished_at,now()),updated_at=now() where id=${job.id}::uuid and user_id=${auth.user.id}::uuid`
        job.status = 'failed'
        return json(409, { error: 'SYNC_JOB_FAILED', job: publicJob(job) }, origin)
      }
      const completed = await sql<any[]>`select count(*)::int as n from public.marketplace_sync_job_chunks where job_id=${job.id}::uuid and user_id=${auth.user.id}::uuid and status='success'`
      const completedCount = Number(completed[0]?.n || 0)
      if (completedCount >= Number(job.total_chunks)) {
        await sql`update public.marketplace_sync_jobs set status='success',completed_chunks=${completedCount},safe_error_code=null,finished_at=coalesce(finished_at,now()),updated_at=now() where id=${job.id}::uuid and user_id=${auth.user.id}::uuid`
        job.status = 'success'; job.completed_chunks = completedCount
        return json(200, { ok: true, job: publicJob(job) }, origin)
      }
      return json(202, { ok: true, job: publicJob(job) }, origin)
    }

    if (chunk.status === 'retry_wait' && chunk.next_retry_at && new Date(chunk.next_retry_at).getTime() > Date.now()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((new Date(chunk.next_retry_at).getTime() - Date.now()) / 1000))
      return json(202, { ok: true, retryAfterSeconds, job: publicJob(job, chunk) }, origin)
    }

    const runningRows = await sql<any[]>`
      update public.marketplace_sync_job_chunks
      set status='running',attempt_count=attempt_count+1,next_retry_at=null,safe_error_code=null,started_at=coalesce(started_at,now()),updated_at=now()
      where id=${chunk.id}::uuid and job_id=${job.id}::uuid and user_id=${auth.user.id}::uuid and status in ('pending','retry_wait')
      returning id,job_id,chunk_index,range_start::text,range_end::text,status,attempt_count,next_retry_at,safe_error_code`
    const running = runningRows[0]
    if (!running) return json(409, { error: 'SYNC_CHUNK_BUSY', job: publicJob(job, chunk) }, origin)

    const authorization = req.headers.get('Authorization') || ''
    const providerBody = { connection_id: connectionId, start_day: running.range_start, end_day: running.range_end }
    const core = await providerCall('trendyol-sync', authorization, providerBody)
    if (!core.ok) {
      const code = String(core.data?.error || `HTTP_${core.status}`).slice(0, 80)
      const attempt = Number(running.attempt_count || 1)
      if (retryable(code, core.status) && attempt < MAX_ATTEMPTS) {
        const delay = retryDelaySeconds(attempt, code)
        await sql`update public.marketplace_sync_job_chunks set status='retry_wait',safe_error_code=${code},next_retry_at=now()+(${delay}::text||' seconds')::interval,updated_at=now() where id=${running.id}::uuid and user_id=${auth.user.id}::uuid`
        await sql`update public.marketplace_sync_jobs set status='retry_wait',safe_error_code=${code},updated_at=now() where id=${job.id}::uuid and user_id=${auth.user.id}::uuid`
        job.status = 'retry_wait'; job.safe_error_code = code
        return json(202, { ok: true, retryAfterSeconds: delay, job: publicJob(job, { ...running, status: 'retry_wait' }) }, origin)
      }
      await sql`update public.marketplace_sync_job_chunks set status='failed',safe_error_code=${code},finished_at=now(),updated_at=now() where id=${running.id}::uuid and user_id=${auth.user.id}::uuid`
      await sql`update public.marketplace_sync_jobs set status='failed',safe_error_code=${code},finished_at=now(),updated_at=now() where id=${job.id}::uuid and user_id=${auth.user.id}::uuid`
      job.status = 'failed'; job.safe_error_code = code
      await deliverOutboundEvent(sql, auth.user.id, 'sync.failed', { marketplace: 'trendyol', connectionId, code }).catch(() => {})
      return json(core.status >= 400 && core.status < 500 ? core.status : 502, { error: code, job: publicJob(job, { ...running, status: 'failed' }) }, origin)
    }

    const auxiliary = await providerCall('trendyol-otherfinancials-sync', authorization, providerBody)
    const auxiliaryComplete = auxiliary.ok && auxiliary.data?.cargoOk === true && auxiliary.data?.orderMapOk === true
    if (!auxiliaryComplete) {
      const code = String(auxiliary.ok ? 'AUXILIARY_INCOMPLETE' : auxiliary.data?.error || `HTTP_${auxiliary.status}`).slice(0, 80)
      const attempt = Number(running.attempt_count || 1)
      if (retryable(code, auxiliary.status) && attempt < MAX_ATTEMPTS) {
        const delay = retryDelaySeconds(attempt, code)
        await sql`update public.marketplace_sync_job_chunks set status='retry_wait',safe_error_code=${code},next_retry_at=now()+(${delay}::text||' seconds')::interval,core_summary=${JSON.stringify({ importedTransactions: Number(core.data?.importedTransactions || 0), dailyRows: Number(core.data?.dailyRows || 0), startDay: core.data?.startDay || running.range_start, endDay: core.data?.endDay || running.range_end })}::jsonb,updated_at=now() where id=${running.id}::uuid and user_id=${auth.user.id}::uuid`
        await sql`update public.marketplace_sync_jobs set status='retry_wait',safe_error_code=${code},updated_at=now() where id=${job.id}::uuid and user_id=${auth.user.id}::uuid`
        job.status = 'retry_wait'; job.safe_error_code = code
        return json(202, { ok: true, retryAfterSeconds: delay, job: publicJob(job, { ...running, status: 'retry_wait' }) }, origin)
      }
      await sql`update public.marketplace_sync_job_chunks set status='failed',safe_error_code=${code},finished_at=now(),updated_at=now() where id=${running.id}::uuid and user_id=${auth.user.id}::uuid`
      await sql`update public.marketplace_sync_jobs set status='failed',safe_error_code=${code},finished_at=now(),updated_at=now() where id=${job.id}::uuid and user_id=${auth.user.id}::uuid`
      job.status = 'failed'; job.safe_error_code = code
      await deliverOutboundEvent(sql, auth.user.id, 'sync.failed', { marketplace: 'trendyol', connectionId, code }).catch(() => {})
      return json(502, { error: code, job: publicJob(job, { ...running, status: 'failed' }) }, origin)
    }

    const coreSummary = {
      importedTransactions: Number(core.data?.importedTransactions || 0),
      dailyRows: Number(core.data?.dailyRows || 0),
      startDay: core.data?.startDay || running.range_start,
      endDay: core.data?.endDay || running.range_end
    }
    const auxiliarySummary = {
      platformServiceFeeRows: Number(auxiliary.data?.platformServiceFeeRows || 0),
      stoppageRows: Number(auxiliary.data?.stoppageRows || 0),
      cargoItems: Number(auxiliary.data?.cargoItems || 0),
      cargoAllocations: Number(auxiliary.data?.cargoAllocations || 0),
      cargoOk: true,
      orderMapOk: true
    }
    await sql`update public.marketplace_sync_job_chunks set status='success',safe_error_code=null,next_retry_at=null,core_summary=${JSON.stringify(coreSummary)}::jsonb,auxiliary_summary=${JSON.stringify(auxiliarySummary)}::jsonb,finished_at=now(),updated_at=now() where id=${running.id}::uuid and user_id=${auth.user.id}::uuid`

    const completedRows = await sql<any[]>`select count(*)::int as n,coalesce(sum((core_summary->>'importedTransactions')::int),0)::int as imported from public.marketplace_sync_job_chunks where job_id=${job.id}::uuid and user_id=${auth.user.id}::uuid and status='success'`
    const completedCount = Number(completedRows[0]?.n || 0)
    const importedTransactions = Number(completedRows[0]?.imported || 0)
    const done = completedCount >= Number(job.total_chunks)

    if (done) {
      const summary = JSON.stringify({ coverage: 'resumable_trendyol_v1', chunkDays: CHUNK_DAYS, completedChunks: completedCount, totalChunks: Number(job.total_chunks), auxiliaryRequired: true })
      await sql.begin(async tx => {
        await tx`update public.marketplace_sync_jobs set status='success',completed_chunks=${completedCount},safe_error_code=null,finished_at=now(),updated_at=now() where id=${job.id}::uuid and user_id=${auth.user.id}::uuid`
        await tx`insert into public.marketplace_sync_runs(connection_id,user_id,range_start,range_end,status,imported_transactions,result_summary,started_at,finished_at,worker_version)
          values(${connectionId}::uuid,${auth.user.id}::uuid,(${job.range_start}::date::timestamp at time zone 'Europe/Istanbul'),least(now(),(((${job.range_end}::date+1)::timestamp at time zone 'Europe/Istanbul')-interval '1 millisecond')),'success',${importedTransactions},${summary}::jsonb,now(),now(),'trendyol-resumable-v1')`
        await tx`update public.marketplace_connections set status='connected',last_sync_at=now(),last_sync_status='success',updated_at=now() where id=${connectionId}::uuid and user_id=${auth.user.id}::uuid`
      })
      job.status = 'success'; job.completed_chunks = completedCount; job.safe_error_code = null
      await deliverOutboundEvent(sql, auth.user.id, 'sync.completed', {
        marketplace: 'trendyol',
        connectionId,
        rangeStart: job.range_start,
        rangeEnd: job.range_end,
        importedTransactions,
        completedChunks: completedCount,
        totalChunks: Number(job.total_chunks)
      }).catch(() => {})
      return json(200, { ok: true, chunk: { ...coreSummary, ...auxiliarySummary }, job: publicJob(job, { ...running, status: 'success' }) }, origin)
    }

    await sql`update public.marketplace_sync_jobs set status='running',completed_chunks=${completedCount},safe_error_code=null,updated_at=now() where id=${job.id}::uuid and user_id=${auth.user.id}::uuid`
    job.status = 'running'; job.completed_chunks = completedCount; job.safe_error_code = null
    return json(202, { ok: true, chunk: { ...coreSummary, ...auxiliarySummary }, job: publicJob(job, { ...running, status: 'success' }) }, origin)
  } catch {
    await sql`update public.marketplace_sync_jobs set status='retry_wait',safe_error_code='ORCHESTRATOR_ERROR',updated_at=now() where id=${job.id}::uuid and user_id=${auth.user.id}::uuid`.catch(() => {})
    job.status = 'retry_wait'; job.safe_error_code = 'ORCHESTRATOR_ERROR'
    return json(500, { error: 'ORCHESTRATOR_ERROR', job: publicJob(job) }, origin)
  } finally {
    await releaseLease(job.id, auth.user.id, leaseToken)
  }
})
