import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import {
  aggregateCashRows,
  clamp01,
  money,
  numberValue,
  percent,
  readAllPages
} from '../_shared/finance.js'

const PROJECT_URL = Deno.env.get('SUPABASE_URL') || ''
const PROJECT_ORIGIN = (() => { try { return new URL(PROJECT_URL).origin } catch { return '' } })()
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
})

const THRESHOLDS = {
  lowMarginPct: 5,
  highReturnPct: 20,
  highCargoBurdenPct: 15,
  minSalesForRateAlert: 500,
  minCargoAllocationCoveragePct: 80
}

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

function startDay(days: number) {
  const parts = dayFormatter.formatToParts(new Date())
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const todayIstanbul = Date.UTC(get('year'), get('month') - 1, get('day')) - 3 * 60 * 60 * 1000
  return dayKey(new Date(todayIstanbul - (days - 1) * 86400000))
}

function buildProductMap(rows: any[]) {
  const products = new Map<string, any>()
  for (const row of rows) {
    const id = String(row.external_product_id || row.barcode || '').trim()
    if (!id) continue
    const product = products.get(id) || {
      externalProductId: id,
      sku: row.sku || null,
      barcode: row.barcode || id,
      name: row.product_name || null,
      grossSales: 0,
      grossReturns: 0,
      sellerRevenue: 0,
      profit: 0,
      profitRows: 0
    }
    product.grossSales += numberValue(row.gross_sales)
    product.grossReturns += numberValue(row.gross_returns)
    product.sellerRevenue += numberValue(row.seller_revenue)
    if (row.estimated_profit !== null) {
      product.profit += numberValue(row.estimated_profit)
      product.profitRows++
    }
    if (!product.name && row.product_name) product.name = row.product_name
    if (!product.sku && row.sku) product.sku = row.sku
    products.set(id, product)
  }
  return products
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
  const connectionId = url.searchParams.get('connection_id') || ''
  const requestedDays = Number(url.searchParams.get('days') || 30)
  const days = [7, 30].includes(requestedDays) ? requestedDays : 30
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return json(400, { error: 'INVALID_CONNECTION' }, origin)

  const { data: connection } = await supabase.from('marketplace_connections').select('id').eq('id', connectionId).maybeSingle()
  if (!connection) return json(404, { error: 'NOT_FOUND' }, origin)

  const start = startDay(days)
  let productRows: any[]
  let allocations: any[]
  let dailyRows: any[]
  try {
    [productRows, allocations, dailyRows] = await Promise.all([
      readAllPages((from, to) => supabase.from('marketplace_product_daily_metrics')
        .select('id,external_product_id,sku,barcode,product_name,gross_sales,gross_returns,seller_revenue,estimated_profit')
        .eq('connection_id', connectionId).gte('day', start).order('id', { ascending: true }).range(from, to)),
      readAllPages((from, to) => supabase.from('marketplace_product_cargo_allocations')
        .select('id,external_product_id,allocated_amount')
        .eq('connection_id', connectionId).gte('invoice_day', start).order('id', { ascending: true }).range(from, to)),
      readAllPages((from, to) => supabase.from('marketplace_daily_financials')
        .select('id,seller_revenue,settlement_adjustment_net,platform_service_fee_cost,cargo_cost,stoppage_net')
        .eq('connection_id', connectionId).gte('day', start).order('id', { ascending: true }).range(from, to))
    ])
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'DATA_TOO_LARGE'
    return json(tooLarge ? 409 : 500, { error: tooLarge ? 'DATA_TOO_LARGE' : 'DB_ERROR' }, origin)
  }

  const cash = aggregateCashRows(dailyRows)
  const cargoByProduct = new Map<string, number>()
  let allocatedCargo = 0
  for (const row of allocations) {
    const id = String(row.external_product_id || '')
    const amount = numberValue(row.allocated_amount)
    allocatedCargo += amount
    if (id) cargoByProduct.set(id, (cargoByProduct.get(id) || 0) + amount)
  }

  const allocationCoverage = cash.cargoCost > 0 ? clamp01(allocatedCargo / cash.cargoCost) : 1
  const products = buildProductMap(productRows)
  const alerts: any[] = []

  for (const product of products.values()) {
    const cargoCost = cargoByProduct.get(product.externalProductId) || 0
    const estimatedProfit = product.profitRows ? product.profit : null
    const profitAfterCargo = estimatedProfit === null ? null : estimatedProfit - cargoCost
    const marginAfterCargo = profitAfterCargo === null || product.sellerRevenue === 0 ? null : profitAfterCargo / product.sellerRevenue * 100
    const returnRate = product.grossSales > 0 ? product.grossReturns / product.grossSales * 100 : 0
    const cargoBurden = product.sellerRevenue > 0 ? cargoCost / product.sellerRevenue * 100 : 0
    const label = product.name || product.sku || product.barcode || product.externalProductId

    if (profitAfterCargo !== null && profitAfterCargo < 0) {
      alerts.push({ type: 'loss_after_cargo', severity: 'critical', externalProductId: product.externalProductId, label, value: money(profitAfterCargo), message: `${label}: bilinen ürün maliyeti ve eşleşen kargo sonrası katkı negatif.` })
    } else if (marginAfterCargo !== null && marginAfterCargo < THRESHOLDS.lowMarginPct) {
      alerts.push({ type: 'low_margin', severity: 'warning', externalProductId: product.externalProductId, label, value: percent(marginAfterCargo), message: `${label}: bilinen maliyet ve kargo sonrası katkı oranı %${percent(marginAfterCargo)}.` })
    }

    if (product.grossSales >= THRESHOLDS.minSalesForRateAlert && returnRate >= THRESHOLDS.highReturnPct) {
      alerts.push({ type: 'high_return_rate', severity: 'warning', externalProductId: product.externalProductId, label, value: percent(returnRate), message: `${label}: iade oranı %${percent(returnRate)}.` })
    }
    if (product.sellerRevenue > 0 && cargoBurden >= THRESHOLDS.highCargoBurdenPct) {
      alerts.push({ type: 'high_cargo_burden', severity: 'warning', externalProductId: product.externalProductId, label, value: percent(cargoBurden), message: `${label}: eşleşen kargo yükü satıcı gelirinin %${percent(cargoBurden)}'si.` })
    }
    if (estimatedProfit === null && product.grossSales >= THRESHOLDS.minSalesForRateAlert) {
      alerts.push({ type: 'missing_cost', severity: 'info', externalProductId: product.externalProductId, label, value: money(product.grossSales), message: `${label}: satış var ama ürün maliyeti eksik; katkı sonucu bilinmiyor.` })
    }
  }

  if (cash.cargoCost > 0 && allocationCoverage * 100 < THRESHOLDS.minCargoAllocationCoveragePct) {
    alerts.push({
      type: 'cargo_allocation_gap', severity: 'warning', externalProductId: null, label: 'Kargo eşleştirme',
      value: percent(allocationCoverage * 100),
      message: `Kargo maliyetinin yalnızca %${percent(allocationCoverage * 100)} bölümü ürünlere kanıtlı dağıtılabildi.`
    })
  }

  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9) || Math.abs(Number(b.value) || 0) - Math.abs(Number(a.value) || 0))

  const counts = {
    critical: alerts.filter(alert => alert.severity === 'critical').length,
    warning: alerts.filter(alert => alert.severity === 'warning').length,
    info: alerts.filter(alert => alert.severity === 'info').length
  }

  return json(200, {
    connectionId,
    rangeDays: days,
    startDay: start,
    thresholds: THRESHOLDS,
    counts,
    total: alerts.length,
    alerts: alerts.slice(0, 20),
    engine: 'rules_v4_shared_finance',
    financialTruth: {
      coreSellerRevenue: cash.sellerRevenue,
      settlementAdjustmentNet: cash.settlementAdjustmentNet,
      adjustedSellerRevenue: cash.adjustedSellerRevenue,
      platformServiceFeeCost: cash.platformServiceFeeCost,
      cargoCost: cash.cargoCost,
      stoppageNet: cash.stoppageNet,
      platformCashBeforeStoppage: cash.platformCashBeforeStoppage,
      knownCashAfterFeesAndStoppage: cash.knownCashAfterFeesAndStoppage,
      allocatedCargoCost: money(allocatedCargo),
      cargoAllocationCoverage: percent(allocationCoverage * 100)
    },
    disclaimer: 'Ürün alarmları yalnız bilinen ürün maliyeti ve eşleştirilebilen kargo kapsamındadır. Stopaj nakit kesintisi olarak gösterilir; muhasebe net kârı değildir.'
  }, origin)
})
