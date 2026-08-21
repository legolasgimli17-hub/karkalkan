import { allowedOrigin, json, responseHeaders } from '../_shared/edge-auth.ts'
import { createTransactionPool } from '../_shared/postgres.ts'

const sql = createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL') || '', { max_lifetime: 30 })

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  if (!allowedOrigin(origin)) return json(403, { status: 'unavailable' }, origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin) })
  if (req.method !== 'GET') return json(405, { status: 'unavailable' }, origin)

  const checkedAt = new Date().toISOString()
  if (!sql) return json(503, {
    status: 'degraded',
    checkedAt,
    components: { runtime: 'operational', database: 'degraded' }
  }, origin)

  try {
    await sql`select 1 as ok`
    return json(200, {
      status: 'operational',
      checkedAt,
      components: { runtime: 'operational', database: 'operational' },
      note: 'Current component check only; this endpoint does not claim historical uptime or an SLA.'
    }, origin)
  } catch {
    return json(503, {
      status: 'degraded',
      checkedAt,
      components: { runtime: 'operational', database: 'degraded' },
      note: 'Current component check only; this endpoint does not expose internal error details.'
    }, origin)
  }
})
