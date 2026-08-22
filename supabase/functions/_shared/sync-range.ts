const DAY_MS = 86_400_000
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
})

function dayKey(value = new Date()) {
  const parts = formatter.formatToParts(value)
  const get = (type: string) => parts.find(part => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function validDay(value: unknown) {
  const text = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const probe = new Date(`${text}T12:00:00Z`)
  if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== text) return null
  return text
}

export type ResolvedSyncRange = {
  start: number
  end: number
  startDay: string
  endDay: string
  rangeDays: number
  mode: 'relative' | 'explicit'
}

export function resolveSyncRange(
  body: any,
  options: { allowedDays?: number[]; maxExplicitDays?: number } = {},
): ResolvedSyncRange | null {
  const allowedDays = options.allowedDays || [7, 30]
  const maxExplicitDays = Math.max(1, Math.min(7, Math.trunc(options.maxExplicitDays || 3)))
  const hasStart = body?.start_day !== undefined
  const hasEnd = body?.end_day !== undefined

  if (hasStart || hasEnd) {
    if (!hasStart || !hasEnd) return null
    const startDay = validDay(body.start_day)
    const endDay = validDay(body.end_day)
    if (!startDay || !endDay || startDay > endDay) return null
    const today = dayKey()
    if (endDay > today) return null
    const span = Math.round((Date.parse(`${endDay}T12:00:00Z`) - Date.parse(`${startDay}T12:00:00Z`)) / DAY_MS) + 1
    if (span < 1 || span > maxExplicitDays) return null
    const start = Date.parse(`${startDay}T00:00:00+03:00`)
    const endOfDay = Date.parse(`${endDay}T00:00:00+03:00`) + DAY_MS - 1
    const end = endDay === today ? Math.min(endOfDay, Date.now()) : endOfDay
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
    return { start, end, startDay, endDay, rangeDays: span, mode: 'explicit' }
  }

  const days = Number(body?.days ?? 30)
  if (!Number.isInteger(days) || !allowedDays.includes(days)) return null
  const parts = formatter.formatToParts(new Date())
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const todayStart = Date.UTC(get('year'), get('month') - 1, get('day')) - 3 * 60 * 60 * 1000
  const start = todayStart - (days - 1) * DAY_MS
  const end = Date.now()
  return { start, end, startDay: dayKey(new Date(start)), endDay: dayKey(new Date(end)), rangeDays: days, mode: 'relative' }
}
