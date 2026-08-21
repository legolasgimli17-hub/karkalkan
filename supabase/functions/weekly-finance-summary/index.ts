import { authenticate, allowedOrigin, json, responseHeaders } from '../_shared/edge-auth.ts'
import { createTransactionPool } from '../_shared/postgres.ts'
import { consumeRateLimit, isUuid } from '../_shared/request-security.ts'
import {
  aggregateCashRows,
  cents,
  contributionAfterKnownCosts,
  money,
  moneyFromCents,
  overlapShare,
  readAllPages,
  salesCostCoverage
} from '../_shared/finance.js'

const sql = createTransactionPool(Deno.env.get('KARKALKAN_DB_POOLER_URL') || '', { max_lifetime: 60 })
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
})

function dayKey(date = new Date()) {
  const parts = dayFormatter.formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function addDays(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return date.toISOString().slice(0, 10)
}

function pctChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null
  return Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100
}

function percent(value: number) {
  return Math.round(value * 100) / 100
}

function summarizePeriod(daily: any[], products: any[], expenses: any[], start: string, end: string) {
  const cash = aggregateCashRows(daily)
  const totals = daily.reduce((acc, row) => {
    acc.grossSales += cents(row.gross_sales)
    acc.grossReturns += cents(row.gross_returns)
    acc.commissionCost += cents(row.commission_cost)
    acc.discountCost += cents(row.discount_cost)
    acc.couponCost += cents(row.coupon_cost)
    acc.transactions += Math.max(0, Math.trunc(Number(row.transaction_count) || 0))
    if (row.other_financial_coverage && row.other_financial_coverage !== 'none') acc.otherFinancialDays++
    return acc
  }, { grossSales: 0, grossReturns: 0, commissionCost: 0, discountCost: 0, couponCost: 0, transactions: 0, otherFinancialDays: 0 })

  const cost = salesCostCoverage(products)
  const operatingExpenses = money(expenses.reduce((sum, row) => {
    const share = overlapShare(start, end, String(row.period_start), String(row.period_end))
    return sum + (Number(row.amount) || 0) * share
  }, 0))
  const grossSales = moneyFromCents(totals.grossSales)
  const grossReturns = moneyFromCents(totals.grossReturns)
  const contribution = contributionAfterKnownCosts({
    knownCashAfterFeesAndStoppage: cash.knownCashAfterFeesAndStoppage,
    knownCogs: cost.knownCogs,
    operatingExpenses,
    costCoverage: cost.coverage,
    hasSales: grossSales > 0
  })

  const costCoveredProducts = products.filter(row => row.known_cogs !== null && row.known_cogs !== undefined).length
  const lossProducts = products.filter(row => row.estimated_profit !== null && Number(row.estimated_profit) < 0).length

  return {
    start,
    end,
    currency: daily[0]?.currency || 'TRY',
    dataDays: daily.length,
    grossSales,
    grossReturns,
    netSales: moneyFromCents(totals.grossSales - totals.grossReturns),
    returnRate: totals.grossSales ? percent(totals.grossReturns / totals.grossSales * 100) : 0,
    commissionCost: moneyFromCents(totals.commissionCost),
    discountCost: moneyFromCents(totals.discountCost),
    couponCost: moneyFromCents(totals.couponCost),
    transactions: totals.transactions,
    ...cash,
    knownCogs: cost.knownCogs,
    costCoverage: cost.coverage,
    operatingExpenses,
    contributionAfterKnownCosts: contribution,
    contributionScope: contribution === null ? 'unavailable_until_full_sales_cost_coverage' : 'known_cash_minus_known_cogs_minus_prorated_operating_expenses',
    productRows: products.length,
    costCoveredProducts,
    lossProducts,
    otherFinancialCoverage: daily.length && totals.otherFinancialDays === daily.length ? 'complete' : totals.otherFinancialDays ? 'partial' : 'none'
  }
}

function buildSignals(current: any, previous: any) {
  const signals: Array<{ code: string; severity: 'info' | 'watch' | 'good'; text: string }> = []
  const salesChange = pctChange(current.grossSales, previous.grossSales)
  const cashChange = pctChange(current.knownCashAfterFeesAndStoppage, previous.knownCashAfterFeesAndStoppage)
  const contributionChange = pctChange(current.contributionAfterKnownCosts, previous.contributionAfterKnownCosts)
  const returnRateDelta = Math.round((current.returnRate - previous.returnRate) * 100) / 100

  if (salesChange !== null && salesChange >= 10) signals.push({ code: 'SALES_UP', severity: 'good', text: `Brüt satış önceki 7 güne göre %${salesChange} arttı.` })
  else if (salesChange !== null && salesChange <= -10) signals.push({ code: 'SALES_DOWN', severity: 'watch', text: `Brüt satış önceki 7 güne göre %${Math.abs(salesChange)} geriledi.` })

  if (returnRateDelta >= 2) signals.push({ code: 'RETURN_RATE_UP', severity: 'watch', text: `İade oranı ${returnRateDelta} puan yükseldi.` })
  else if (returnRateDelta <= -2) signals.push({ code: 'RETURN_RATE_DOWN', severity: 'good', text: `İade oranı ${Math.abs(returnRateDelta)} puan düştü.` })

  if (cashChange !== null && cashChange <= -10) signals.push({ code: 'KNOWN_CASH_DOWN', severity: 'watch', text: `Bilinen kesintiler sonrası nakit %${Math.abs(cashChange)} geriledi.` })
  if (current.contributionAfterKnownCosts !== null && current.contributionAfterKnownCosts < 0) signals.push({ code: 'CONTRIBUTION_NEGATIVE', severity: 'watch', text: 'Tam maliyet kapsamındaki ürün katkısı bu 7 günde negatif.' })
  else if (contributionChange !== null && contributionChange >= 10) signals.push({ code: 'CONTRIBUTION_UP', severity: 'good', text: `Bilinen maliyetler sonrası katkı %${contributionChange} arttı.` })

  if (current.costCoverage < .999) signals.push({ code: 'COST_COVERAGE_PARTIAL', severity: 'info', text: `Satış bazlı maliyet kapsamı %${Math.round(current.costCoverage * 1000) / 10}; katkı rakamı bu nedenle kesinleştirilmedi.` })
  if (current.otherFinancialCoverage !== 'complete') signals.push({ code: 'OTHER_FINANCIAL_PARTIAL', severity: 'info', text: 'Platform hizmet/kargo/stoppage kapsamı tüm veri günlerinde tam değil.' })
  if (!signals.length) signals.push({ code: 'NO_MATERIAL_CHANGE', severity: 'info', text: 'Önceki 7 güne göre eşik aşan belirgin bir değişim yok.' })
  return signals.slice(0, 5)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  if (!allowedOrigin(origin)) return json(403, { error: 'ORIGIN_NOT_ALLOWED' }, origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin) })
  if (req.method !== 'GET') return json(405, { error: 'METHOD_NOT_ALLOWED' }, origin)

  let auth
  try { auth = await authenticate(req) } catch { return json(503, { error: 'SERVER_CONFIG' }, origin) }
  if (!auth) return json(401, { error: 'UNAUTHORIZED' }, origin)
  if (!sql) return json(503, { error: 'SERVER_MISCONFIGURED' }, origin)

  try {
    if (!(await consumeRateLimit(sql, 'weekly-finance-summary', auth.user.id, 60, 3600))) return json(429, { error: 'RATE_LIMITED' }, origin)
  } catch { return json(500, { error: 'RATE_LIMIT_FAILED' }, origin) }

  const url = new URL(req.url)
  const connectionId = String(url.searchParams.get('connection_id') || '')
  if (!isUuid(connectionId)) return json(400, { error: 'INVALID_CONNECTION' }, origin)

  const { data: connection, error: connectionError } = await auth.userClient
    .from('marketplace_connections')
    .select('id,marketplace,display_name,status,last_sync_at,last_sync_status')
    .eq('id', connectionId)
    .maybeSingle()
  if (connectionError) return json(500, { error: 'DB_ERROR' }, origin)
  if (!connection) return json(404, { error: 'NOT_FOUND' }, origin)

  const today = dayKey()
  const currentEnd = addDays(today, -1)
  const currentStart = addDays(currentEnd, -6)
  const previousEnd = addDays(currentStart, -1)
  const previousStart = addDays(previousEnd, -6)

  let daily: any[] = [], products: any[] = [], expenses: any[] = []
  try {
    ;[daily, products, expenses] = await Promise.all([
      readAllPages((from, to) => auth.userClient.from('marketplace_daily_financials')
        .select('day,currency,gross_sales,gross_returns,commission_cost,discount_cost,coupon_cost,seller_revenue,settlement_adjustment_net,platform_service_fee_cost,cargo_cost,stoppage_net,transaction_count,other_financial_coverage')
        .eq('connection_id', connectionId).gte('day', previousStart).lte('day', currentEnd).order('day', { ascending: true }).range(from, to)),
      readAllPages((from, to) => auth.userClient.from('marketplace_product_daily_metrics')
        .select('day,gross_sales,known_cogs,estimated_profit')
        .eq('connection_id', connectionId).gte('day', previousStart).lte('day', currentEnd).order('day', { ascending: true }).range(from, to)),
      readAllPages((from, to) => auth.userClient.from('marketplace_operating_expenses')
        .select('amount,period_start,period_end')
        .eq('connection_id', connectionId).lte('period_start', currentEnd).gte('period_end', previousStart).order('period_start', { ascending: true }).range(from, to))
    ])
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'DATA_TOO_LARGE'
    return json(tooLarge ? 409 : 500, { error: tooLarge ? 'DATA_TOO_LARGE' : 'DB_ERROR' }, origin)
  }

  const inRange = (day: unknown, start: string, end: string) => String(day || '') >= start && String(day || '') <= end
  const current = summarizePeriod(
    daily.filter(row => inRange(row.day, currentStart, currentEnd)),
    products.filter(row => inRange(row.day, currentStart, currentEnd)),
    expenses,
    currentStart,
    currentEnd
  )
  const previous = summarizePeriod(
    daily.filter(row => inRange(row.day, previousStart, previousEnd)),
    products.filter(row => inRange(row.day, previousStart, previousEnd)),
    expenses,
    previousStart,
    previousEnd
  )

  return json(200, {
    connection,
    generatedAt: new Date().toISOString(),
    timezone: 'Europe/Istanbul',
    basis: 'last_7_closed_calendar_days_vs_previous_7_closed_calendar_days',
    current,
    previous,
    change: {
      grossSalesPercent: pctChange(current.grossSales, previous.grossSales),
      knownCashPercent: pctChange(current.knownCashAfterFeesAndStoppage, previous.knownCashAfterFeesAndStoppage),
      contributionPercent: pctChange(current.contributionAfterKnownCosts, previous.contributionAfterKnownCosts),
      returnRatePointDelta: Math.round((current.returnRate - previous.returnRate) * 100) / 100
    },
    signals: buildSignals(current, previous),
    truth: {
      authoritativeMath: 'deterministic',
      aiUsedForNumbers: false,
      contributionRequiresFullSalesCostCoverage: true,
      operatingExpensesAreProratedByPeriodOverlap: true,
      referenceOnlyFxIsNotReclassifiedAsRealizedBankFx: true
    }
  }, origin)
})
