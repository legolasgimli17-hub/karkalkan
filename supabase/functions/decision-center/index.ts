import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import {
  aggregateCashRows,
  clamp01,
  money,
  numberValue,
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

function validUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value)
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

function scorePct(value: number) {
  return Math.round(clamp01(value) * 100)
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
  if (!validUuid(connectionId)) return json(400, { error: 'INVALID_CONNECTION' }, origin)

  const { data: connection, error: connectionError } = await supabase
    .from('marketplace_connections')
    .select('id,last_sync_at,last_sync_status')
    .eq('id', connectionId)
    .maybeSingle()
  if (connectionError) return json(500, { error: 'DB_ERROR' }, origin)
  if (!connection) return json(404, { error: 'NOT_FOUND' }, origin)

  const start = startDay(days)
  let products: any[]
  let daily: any[]
  let allocations: any[]
  try {
    [products, daily, allocations] = await Promise.all([
      readAllPages((from, to) => supabase.from('marketplace_product_daily_metrics')
        .select('id,gross_sales,known_cogs,sales_unit_basis,claim_item_matches,return_proxy_matches')
        .eq('connection_id', connectionId).gte('day', start).order('id', { ascending: true }).range(from, to)),
      readAllPages((from, to) => supabase.from('marketplace_daily_financials')
        .select('id,gross_sales,gross_returns,commission_cost,settlement_adjustment_net,platform_service_fee_cost,cargo_cost,stoppage_net,seller_revenue')
        .eq('connection_id', connectionId).gte('day', start).order('id', { ascending: true }).range(from, to)),
      readAllPages((from, to) => supabase.from('marketplace_product_cargo_allocations')
        .select('id,allocated_amount')
        .eq('connection_id', connectionId).gte('invoice_day', start).order('id', { ascending: true }).range(from, to))
    ])
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'DATA_TOO_LARGE'
    return json(tooLarge ? 409 : 500, { error: tooLarge ? 'DATA_TOO_LARGE' : 'DB_ERROR' }, origin)
  }

  const [{ data: runs, error: runError }, { data: live, error: liveError }] = await Promise.all([
    supabase.from('marketplace_sync_runs').select('result_summary,status,finished_at').eq('connection_id', connectionId).order('started_at', { ascending: false }).limit(1),
    supabase.from('marketplace_webhooks').select('status').eq('connection_id', connectionId).maybeSingle()
  ])
  if (runError || liveError) return json(500, { error: 'DB_ERROR' }, origin)

  const totalGross = products.reduce((sum, row) => sum + Math.max(0, numberValue(row.gross_sales)), 0)
  const exactGross = products.reduce((sum, row) => sum + (row.sales_unit_basis === 'order_v2_quantity' ? Math.max(0, numberValue(row.gross_sales)) : 0), 0)
  const coverage = salesCostCoverage(products)
  const claimMatches = products.reduce((sum, row) => sum + numberValue(row.claim_item_matches), 0)
  const proxyMatches = products.reduce((sum, row) => sum + numberValue(row.return_proxy_matches), 0)

  const salesEvidence = totalGross ? clamp01(exactGross / totalGross) : 0
  const costCoverage = coverage.coverage
  const returnApplicable = claimMatches + proxyMatches > 0
  const returnEvidence = returnApplicable ? clamp01(claimMatches / (claimMatches + proxyMatches)) : null

  const cash = aggregateCashRows(daily)
  const allocatedCargo = allocations.reduce((sum, row) => sum + numberValue(row.allocated_amount), 0)
  const cargoApplicable = cash.cargoCost > 0
  const cargoCoverage = cargoApplicable ? clamp01(allocatedCargo / cash.cargoCost) : null

  const syncSummary: any = runs?.[0]?.result_summary || {}
  const unclassified = Math.max(0, numberValue(syncSummary.unclassifiedAdjustmentRows))
  const adjustmentImported = Math.max(0, numberValue(syncSummary.adjustmentImported))
  const classificationApplicable = adjustmentImported > 0
  const classification = classificationApplicable ? clamp01(1 - unclassified / adjustmentImported) : null
  const freshness = connection.last_sync_at
    ? clamp01(1 - (Date.now() - new Date(connection.last_sync_at).getTime()) / (72 * 60 * 60 * 1000))
    : 0

  const components: any[] = [
    { key: 'salesEvidence', label: 'Satış kanıtı', score: scorePct(salesEvidence), weight: 25, applicable: true, help: 'Satış hacminin sipariş satırlarıyla doğrulanma düzeyi.' },
    { key: 'returnEvidence', label: 'İade kanıtı', score: returnApplicable ? scorePct(returnEvidence!) : null, weight: 15, applicable: returnApplicable, help: returnApplicable ? 'İadelerin kabul edilmiş claim kayıtlarıyla doğrulanma düzeyi.' : 'Seçili dönemde ölçülebilir iade eşleşmesi yok.' },
    { key: 'costCoverage', label: 'Maliyet kapsamı', score: scorePct(costCoverage), weight: 25, applicable: true, help: 'Satış hacminin ürün maliyeti bilinen bölümü.' },
    { key: 'cargoCoverage', label: 'Kargo eşleşmesi', score: cargoApplicable ? scorePct(cargoCoverage!) : null, weight: 15, applicable: cargoApplicable, help: cargoApplicable ? 'Kargo faturasının ürünlere kanıtlı dağıtılabilen bölümü.' : 'Seçili dönemde ölçülebilir kargo maliyeti yok.' },
    { key: 'classification', label: 'Kesinti sınıflandırması', score: classificationApplicable ? scorePct(classification!) : null, weight: 10, applicable: classificationApplicable, help: classificationApplicable ? 'Hakediş düzeltmelerinin tanınan finans türlerine ayrılma düzeyi.' : 'Seçili dönemde sınıflandırılacak hakediş düzeltmesi yok.' },
    { key: 'freshness', label: 'Veri güncelliği', score: scorePct(freshness), weight: 10, applicable: true, help: 'Son finansal doğrulama senkronunun güncelliği.' }
  ]

  const activeComponents = components.filter(component => component.applicable)
  const activeWeight = activeComponents.reduce((sum, component) => sum + component.weight, 0)
  const confidence = Math.round(activeComponents.reduce((sum, component) => sum + Number(component.score) * component.weight, 0) / Math.max(1, activeWeight))

  const grossReturns = daily.reduce((sum, row) => sum + numberValue(row.gross_returns), 0)
  const grossSales = daily.reduce((sum, row) => sum + numberValue(row.gross_sales), 0)
  const commissionCost = daily.reduce((sum, row) => sum + numberValue(row.commission_cost), 0)
  const leaks: any[] = []

  if (costCoverage < .9) {
    leaks.push({
      key: 'missing_cost', severity: costCoverage < .5 ? 'high' : 'medium', title: 'Maliyet kör noktası',
      impactBasis: money(totalGross - coverage.coveredGrossSales),
      message: `Satış hacminin %${100 - scorePct(costCoverage)} bölümünde ürün maliyeti eksik; bu bölüm için katkı sonucu güvenilir değil.`
    })
  }
  if (cargoApplicable && cargoCoverage! < .9) {
    leaks.push({
      key: 'cargo_gap', severity: cargoCoverage! < .6 ? 'high' : 'medium', title: 'Kargo dağıtım boşluğu',
      impactBasis: money(Math.max(0, cash.cargoCost - allocatedCargo)),
      message: `Kargo maliyetinin %${100 - scorePct(cargoCoverage!)} bölümü ürüne kanıtlı bağlanamadı.`
    })
  }
  if (unclassified > 0) {
    leaks.push({ key: 'unclassified_adjustment', severity: 'high', title: 'Tanımsız hakediş hareketi', impactBasis: null, message: `Son senkronda ${unclassified} finans hareketi mevcut sınıflandırma kurallarıyla tanınmadı.` })
  }
  if (returnApplicable && returnEvidence! < .8) {
    leaks.push({ key: 'return_proxy', severity: 'medium', title: 'İade kanıtı zayıf', impactBasis: money(grossReturns), message: `İade eşleşmesinin %${100 - scorePct(returnEvidence!)} bölümü doğrudan kabul edilmiş claim kanıtına dayanmıyor.` })
  }
  if (freshness < .6) {
    leaks.push({ key: 'stale_sync', severity: 'medium', title: 'Doğrulama gecikmiş', impactBasis: null, message: 'Son finansal doğrulama güncel değil; canlı sipariş sinyali hakediş doğrulamasının yerini tutmaz.' })
  }

  return json(200, {
    connectionId,
    rangeDays: days,
    startDay: start,
    confidenceScore: confidence,
    confidenceLabel: confidence >= 85 ? 'Yüksek' : confidence >= 70 ? 'İyi' : confidence >= 50 ? 'Eksik veri var' : 'Düşük',
    healthScore: confidence,
    healthLabel: confidence >= 85 ? 'Yüksek veri güveni' : confidence >= 70 ? 'İyi veri güveni' : confidence >= 50 ? 'Eksik veri var' : 'Düşük veri güveni',
    components,
    moneyLeakRadar: leaks,
    liveSignal: live?.status === 'active',
    lastSyncAt: connection.last_sync_at,
    lastSyncStatus: connection.last_sync_status,
    totals: {
      grossSales: money(grossSales), grossReturns: money(grossReturns), commissionCost: money(commissionCost),
      settlementAdjustmentNet: cash.settlementAdjustmentNet, platformServiceFeeCost: cash.platformServiceFeeCost,
      cargoCost: cash.cargoCost, stoppageNet: cash.stoppageNet, sellerRevenue: cash.sellerRevenue,
      platformCashBeforeStoppage: cash.platformCashBeforeStoppage,
      knownCashAfterFeesAndStoppage: cash.knownCashAfterFeesAndStoppage
    },
    engine: 'evidence_confidence_v3_shared_finance',
    disclaimer: 'Bu puan mağazanın ticari başarısını değil, finansal verinin kanıt ve kapsama güvenini ölçer; muhasebe görüşü değildir.'
  }, origin)
})
