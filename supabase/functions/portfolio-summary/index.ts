import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import {
  aggregateCashRows,
  contributionAfterKnownCosts,
  money,
  numberValue,
  overlapShare,
  readAllPages,
  salesCostCoverage
} from '../_shared/finance.js'

const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const PROJECT_ORIGIN = (() => { try { return new URL(PROJECT_URL).origin } catch { return '' } })()
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
})

function allowedOrigin(origin: string | null) {
  if (!origin) return true
  if (origin === 'https://karkalkan.vercel.app' || origin === PROJECT_ORIGIN) return true
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' && url.hostname.endsWith('-krgzabdullah22-8562s-projects.vercel.app')
  } catch { return false }
}

function responseHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin'
  }
  if (origin && allowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type'
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
  }
  return headers
}

function json(status: number, body: unknown, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) })
}

function dayKey(date: Date) {
  const parts = dayFormatter.formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function selectedRange(days: number) {
  const parts = dayFormatter.formatToParts(new Date())
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const todayIstanbul = Date.UTC(get('year'), get('month') - 1, get('day')) - 3 * 60 * 60 * 1000
  return {
    start: dayKey(new Date(todayIstanbul - (days - 1) * 86400000)),
    end: dayKey(new Date(todayIstanbul))
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  if (!allowedOrigin(origin)) return json(403, { error: 'ORIGIN_NOT_ALLOWED' }, origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin) })
  if (req.method !== 'GET') return json(405, { error: 'METHOD_NOT_ALLOWED' }, origin)

  const auth = req.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'UNAUTHORIZED' }, origin)

  const publishableKey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default
  if (!PROJECT_URL || !publishableKey) return json(503, { error: 'SERVER_CONFIG' }, origin)

  const supabase = createClient(PROJECT_URL, publishableKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(auth.slice(7))
  if (userError || !userData?.user) return json(401, { error: 'UNAUTHORIZED' }, origin)

  const url = new URL(req.url)
  const requestedDays = Number(url.searchParams.get('days') || 30)
  const days = [7, 30].includes(requestedDays) ? requestedDays : 30
  const { start, end } = selectedRange(days)

  let connections: any[]
  let daily: any[]
  let expenses: any[]
  let products: any[]
  try {
    [connections, daily, expenses, products] = await Promise.all([
      readAllPages((from, to) => supabase.from('marketplace_connections')
        .select('id,marketplace,display_name,external_seller_id,status,last_sync_at,last_sync_status')
        .order('created_at', { ascending: true }).range(from, to)),
      readAllPages((from, to) => supabase.from('marketplace_daily_financials')
        .select('id,connection_id,gross_sales,gross_returns,commission_cost,seller_revenue,settlement_adjustment_net,platform_service_fee_cost,cargo_cost,stoppage_net')
        .gte('day', start).lte('day', end).order('id', { ascending: true }).range(from, to)),
      readAllPages((from, to) => supabase.from('marketplace_operating_expenses')
        .select('id,connection_id,category,amount,period_start,period_end')
        .lte('period_start', end).gte('period_end', start).order('id', { ascending: true }).range(from, to)),
      readAllPages((from, to) => supabase.from('marketplace_product_daily_metrics')
        .select('id,connection_id,gross_sales,known_cogs')
        .gte('day', start).lte('day', end).order('id', { ascending: true }).range(from, to))
    ])
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'DATA_TOO_LARGE'
    return json(tooLarge ? 409 : 500, { error: tooLarge ? 'DATA_TOO_LARGE' : 'DB_ERROR' }, origin)
  }

  const dailyByConnection = new Map<string, any[]>()
  const productByConnection = new Map<string, any[]>()
  const expenseByConnection = new Map<string, any[]>()

  for (const row of daily) {
    const id = String(row.connection_id)
    const rows = dailyByConnection.get(id) || []
    rows.push(row)
    dailyByConnection.set(id, rows)
  }
  for (const row of products) {
    const id = String(row.connection_id)
    const rows = productByConnection.get(id) || []
    rows.push(row)
    productByConnection.set(id, rows)
  }
  for (const row of expenses) {
    const id = String(row.connection_id)
    const rows = expenseByConnection.get(id) || []
    rows.push(row)
    expenseByConnection.set(id, rows)
  }

  const stores = connections.map(connection => {
    const connectionId = String(connection.id)
    const dailyRows = dailyByConnection.get(connectionId) || []
    const productRows = productByConnection.get(connectionId) || []
    const expenseRows = expenseByConnection.get(connectionId) || []
    const cash = aggregateCashRows(dailyRows)
    const cost = salesCostCoverage(productRows)
    const operatingExpenses = expenseRows.reduce((sum, row) => {
      return sum + numberValue(row.amount) * overlapShare(start, end, String(row.period_start), String(row.period_end))
    }, 0)
    const expenseByCategory: Record<string, number> = {}
    for (const row of expenseRows) {
      const key = String(row.category || 'other')
      const allocated = numberValue(row.amount) * overlapShare(start, end, String(row.period_start), String(row.period_end))
      expenseByCategory[key] = (expenseByCategory[key] || 0) + allocated
    }

    const grossSales = dailyRows.reduce((sum, row) => sum + numberValue(row.gross_sales), 0)
    const grossReturns = dailyRows.reduce((sum, row) => sum + numberValue(row.gross_returns), 0)
    const commissionCost = dailyRows.reduce((sum, row) => sum + numberValue(row.commission_cost), 0)
    const operatingContribution = contributionAfterKnownCosts({
      knownCashAfterFeesAndStoppage: cash.knownCashAfterFeesAndStoppage,
      knownCogs: cost.knownCogs,
      operatingExpenses,
      costCoverage: cost.coverage,
      hasSales: cost.grossSales > 0
    })

    return {
      id: connection.id,
      marketplace: connection.marketplace,
      displayName: connection.display_name,
      sellerId: connection.external_seller_id,
      status: connection.status,
      lastSyncAt: connection.last_sync_at,
      lastSyncStatus: connection.last_sync_status,
      grossSales: money(grossSales),
      grossReturns: money(grossReturns),
      commissionCost: money(commissionCost),
      platformCashBeforeStoppage: cash.platformCashBeforeStoppage,
      stoppageNet: cash.stoppageNet,
      knownCashAfterFeesAndStoppage: cash.knownCashAfterFeesAndStoppage,
      knownCogs: cost.knownCogs,
      costCoverage: cost.coverage,
      costComplete: cost.complete,
      operatingExpenses: money(operatingExpenses),
      operatingContribution,
      afterOperatingExpenses: operatingContribution,
      expenseByCategory: Object.fromEntries(Object.entries(expenseByCategory).map(([key, value]) => [key, money(value)]))
    }
  })

  const totals = stores.reduce((acc: any, store: any) => {
    acc.grossSales += store.grossSales
    acc.grossReturns += store.grossReturns
    acc.commissionCost += store.commissionCost
    acc.platformCashBeforeStoppage += store.platformCashBeforeStoppage
    acc.stoppageNet += store.stoppageNet
    acc.knownCashAfterFeesAndStoppage += store.knownCashAfterFeesAndStoppage
    acc.knownCogs += store.knownCogs
    acc.operatingExpenses += store.operatingExpenses
    return acc
  }, {
    grossSales: 0, grossReturns: 0, commissionCost: 0, platformCashBeforeStoppage: 0,
    stoppageNet: 0, knownCashAfterFeesAndStoppage: 0, knownCogs: 0, operatingExpenses: 0
  })

  const portfolioCost = salesCostCoverage(products)
  const portfolioContribution = contributionAfterKnownCosts({
    knownCashAfterFeesAndStoppage: totals.knownCashAfterFeesAndStoppage,
    knownCogs: totals.knownCogs,
    operatingExpenses: totals.operatingExpenses,
    costCoverage: portfolioCost.coverage,
    hasSales: portfolioCost.grossSales > 0
  })

  for (const key of Object.keys(totals)) totals[key] = money(totals[key])
  totals.costCoverage = portfolioCost.coverage
  totals.costComplete = portfolioCost.complete
  totals.operatingContribution = portfolioContribution
  totals.afterOperatingExpenses = portfolioContribution

  return json(200, {
    rangeDays: days,
    startDay: start,
    endDay: end,
    storeCount: stores.length,
    stores,
    totals,
    semantics: {
      platformCashBeforeStoppage: 'Hakediş ve bilinen platform/kargo kesintileri sonrası, stopaj öncesi nakit görünümü.',
      knownCashAfterFeesAndStoppage: 'Platform/kargo kesintileri ve stopaj sonrası bilinen nakit; ürün maliyeti henüz düşülmemiştir.',
      operatingContribution: 'Yalnız satış maliyeti kapsamı tamamlandığında bilinen nakitten ürün maliyeti ve dönemsel işletme giderleri düşülür. Vergi/muhasebe net kârı değildir.',
      incompleteCost: 'Maliyet kapsamı tamamlanmadığında işletme katkısı bilinmiyor (null) döner; eksik maliyet sıfır kabul edilmez.'
    },
    engine: 'portfolio_v3_shared_finance'
  }, origin)
})
