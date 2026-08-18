const encoder = new TextEncoder()

export class RequestSecurityError extends Error {
  constructor(
    public readonly code: 'INVALID_JSON' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE',
    public readonly status: 400 | 413 | 415,
  ) {
    super(code)
    this.name = 'RequestSecurityError'
  }
}

export function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function assertContentLength(req: Request, maxBytes: number) {
  const raw = req.headers.get('content-length')
  if (!raw) return
  if (!/^\d{1,12}$/.test(raw)) throw new RequestSecurityError('PAYLOAD_TOO_LARGE', 413)
  if (Number(raw) > maxBytes) throw new RequestSecurityError('PAYLOAD_TOO_LARGE', 413)
}

function assertJsonMediaType(req: Request) {
  const contentType = String(req.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json' && !contentType.endsWith('+json')) {
    throw new RequestSecurityError('UNSUPPORTED_MEDIA_TYPE', 415)
  }
}

export async function readTextBody(req: Request, maxBytes: number, requireJson = false) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error('INVALID_BODY_LIMIT')
  assertContentLength(req, maxBytes)
  if (requireJson) assertJsonMediaType(req)
  if (!req.body) return ''

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel('PAYLOAD_TOO_LARGE').catch(() => {})
        throw new RequestSecurityError('PAYLOAD_TOO_LARGE', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(joined)
  } catch {
    throw new RequestSecurityError('INVALID_JSON', 400)
  }
}

export async function readJsonBody(req: Request, maxBytes: number): Promise<unknown> {
  const raw = await readTextBody(req, maxBytes, true)
  if (!raw) throw new RequestSecurityError('INVALID_JSON', 400)
  try {
    return JSON.parse(raw)
  } catch {
    throw new RequestSecurityError('INVALID_JSON', 400)
  }
}

export function requestError(error: unknown) {
  return error instanceof RequestSecurityError
    ? { status: error.status, code: error.code }
    : { status: 400 as const, code: 'INVALID_JSON' as const }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function consumeRateLimit(
  sql: any,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
) {
  if (!sql || !/^[a-z0-9_.:-]{1,80}$/i.test(scope) || !key || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error('RATE_LIMIT_CONFIG')
  }
  const nowSeconds = Math.floor(Date.now() / 1000)
  const bucketSeconds = Math.floor(nowSeconds / windowSeconds) * windowSeconds
  const bucketStart = new Date(bucketSeconds * 1000).toISOString()
  const expiresAt = new Date((bucketSeconds + windowSeconds * 2) * 1000).toISOString()
  const keyHash = await sha256(key)
  const rows = await sql`
    insert into public.edge_rate_limits(scope,key_hash,bucket_start,hits,expires_at)
    values(${scope},${keyHash},${bucketStart}::timestamptz,1,${expiresAt}::timestamptz)
    on conflict(scope,key_hash,bucket_start)
    do update set hits=public.edge_rate_limits.hits+1
    returning hits
  `
  const allowed = Number(rows[0]?.hits || 0) <= limit
  if (crypto.getRandomValues(new Uint8Array(1))[0] === 0) {
    await sql`delete from public.edge_rate_limits where expires_at<now()`.catch(() => {})
  }
  return allowed
}
