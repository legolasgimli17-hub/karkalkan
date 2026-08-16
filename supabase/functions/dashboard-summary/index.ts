import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
import {
  aggregateCashRows,
  cashSnapshotFromRow,
  cents,
  moneyFromCents,
  positiveInt,
  ratio,
  readAllPages,
  signedInt
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

function startDay(days: number) {
  const parts = dayFormatter.formatToParts(new Date())
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const todayIstanbul = Date.UTC(get('year'), get('month') - 1, get('day')) - 3 * 60 * 60 * 1000
  return dayKey(new Date(todayIstanbul - (days - 1) * 86400000))
}

function rankBasis(values: Set<string>) {
  if (values.has('mixed_fallback')) return 'mixed_fallback'
  if (values.has('settlement_transaction_proxy')) return 'settlement_transaction_proxy'
  if (values.has('order_v2_sales_settlement_return_proxy')) return 'order_v2_sales_settlement_return_proxy'
  if (values.has('order_v2_sales_claims_accepted_returns')) return 'order_v2_sales_claims_accepted_returns'
  if (values.has('order_v2_exact_sales')) return 'order_v2_exact_sales'
  return 'settlement_transaction_proxy'
}

function rankSales(values: Set<string>) {
  if (values.has('mixed_fallback')) return 'mixed_fallback'
  if (values.has('settlement_transaction_proxy')) return 'settlement_transaction_proxy'
  if (values.has('order_v2_quantity')) return 'order_v2_quantity'
  return 'settlement_transaction_proxy'
}

function rankReturn(values: Set<string>) {
  if (values.has('mixed_fallback')) return 'mixed_fallback'
  if (values.has('settlement_transaction_proxy')) return 'settlement_transaction_proxy'
  if (values.has('claims_accepted_items')) return 'claims_accepted_items'
  return 'settlement_transaction_proxy'
}

function aggregateProductRows(rows: any[]) {
  const products = new Map<string, any>()

  for (const row of rows) {
    const id = String(row.external_product_id || row.barcode || '').trim()
    if (!id) continue

    const product = products.get(id) || {
      externalProductId: id,
      sku: row.sku || null,
      barcode: row.barcode || id,
      name: row.product_name || null,
      units: 0,
      salesUnits: 0,
      returnUnits: 0,
      orderLineMatches: 0,
      returnProxyMatches: 0,
      claimItemMatches: 0,
      unitBases: new Set<string>(),
      salesBases: new Set<string>(),
      returnBases: new Set<string>(),
      grossSales: 0,
      grossReturns: 0,
      commissionCost: 0,
      sellerRevenue: 0,
      knownCogs: 0,
      estimatedProfit: 0,
      profitRows: 0,
      rowCount: 0,
      confidence: 'platform_only'
    }

    product.rowCount++
    product.units += signedInt(row.units)
    product.salesUnits += positiveInt(row.sales_units)
    product.returnUnits += positiveInt(row.return_units)
    product.orderLineMatches += positiveInt(row.order_line_matches)
    product.returnProxyMatches += positiveInt(row.return_proxy_matches)
    product.claimItemMatches += positiveInt(row.claim_item_matches)
    product.unitBases.add(String(row.unit_basis || 'settlement_transaction_proxy'))
    product.salesBases.add(String(row.sales_unit_basis || 'settlement_transaction_proxy'))
    product.returnBases.add(String(row.return_unit_basis || 'settlement_transaction_proxy'))
    product.grossSales += cents(row.gross_sales)
    product.grossReturns += cents(row.gross_returns)
    product.commissionCost += cents(row.commission_cost)
    product.sellerRevenue += cents(row.seller_revenue)
    if (row.known_cogs !== null) product.knownCogs += cents(row.known_cogs)
    if (row.estimated_profit !== null) {
      product.estimatedProfit += cents(row.estimated_profit)
      product.profitRows++
    }
    if (row.profit_confidence === 'cost_known') product.confidence = 'cost_known'
    if (!product.name && row.product_name) product.name = row.product_name
    if (!product.sku && row.sku) product.sku = row.sku
    products.set(id, product)
  }

  return [...products.values()].map(product => {
    const grossSales = moneyFromCents(product.grossSales)
    const sellerRevenue = moneyFromCents(product.sellerRevenue)
    const estimatedProfit = product.profitRows ? moneyFromCents(product.estimatedProfit) : null
    const knownCogs = product.profitRows ? moneyFromCents(product.knownCogs) : null
    const margin = estimatedProfit !== null && sellerRevenue ? estimatedProfit / sellerRevenue * 100 : null
    const unitBasis = rankBasis(product.unitBases)
    const salesUnitBasis = rankSales(product.salesBases)
    const returnUnitBasis = rankReturn(product.returnBases)

    let unitConfidence = 'proxy'
    if (salesUnitBasis === 'order_v2_quantity' && returnUnitBasis === 'claims_accepted_items') unitConfidence = 'sales_and_returns_evidence'
    else if (salesUnitBasis === 'order_v2_quantity' && product.returnUnits === 0) unitConfidence = 'exact_sales'
    else if (salesUnitBasis === 'order_v2_quantity') unitConfidence = 'exact_sales_return_proxy'
    else if (salesUnitBasis === 'mixed_fallback' || returnUnitBasis === 'mixed_fallback') unitConfidence = 'mixed'

    return {
      externalProductId: product.externalProductId,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      units: product.units,
      salesUnits: product.salesUnits,
      returnUnits: product.returnUnits,
      unitBasis,
      salesUnitBasis,
      returnUnitBasis,
      unitConfidence,
      orderLineMatches: product.orderLineMatches,
      returnProxyMatches: product.returnProxyMatches,
      claimItemMatches: product.claimItemMatches,
      grossSales,
      grossReturns: moneyFromCents(product.grossReturns),
      commissionCost: moneyFromCents(product.commissionCost),
      sellerRevenue,
      knownCogs,
      estimatedProfit,
      margin,
      confidence: product.confidence,
      costCoverage: product.rowCount ? product.profitRows / product.rowCount : 0,
      status: estimatedProfit === null ? 'unknown' : estimatedProfit < 0 ? 'loss' : sellerRevenue && margin !== null && margin < 10 ? 'risk' : 'healthy'
    }
  })
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

  const { data: connection, error: connectionError } = await supabase
    .from('marketplace_connections')
    .select('id,marketplace,display_name,status,last_sync_at,last_sync_status')
    .eq('id', connectionId)
    .maybeSingle()
  if (connectionError) return json(500, { error: 'DB_ERROR' }, origin)
  if (!connection) return json(404, { error: 'NOT_FOUND' }, origin)

  const start = startDay(days)
  let daily: any[]
  let rawProducts: any[]
  try {
    [daily, rawProducts] = await Promise.all([
      readAllPages((from, to) => supabase
        .from('marketplace_daily_financials')
        .select('id,day,currency,gross_sales,gross_returns,commission_cost,discount_cost,coupon_cost,provision_net,manual_refund_net,platform_promo_net,delivery_fee_net,correction_net,settlement_adjustment_net,settlement_coverage,platform_service_fee_cost,cargo_cost,stoppage_net,other_financial_coverage,seller_revenue,transaction_count')
        .eq('connection_id', connectionId).gte('day', start).order('day', { ascending: true }).range(from, to)),
      readAllPages((from, to) => supabase
        .from('marketplace_product_daily_metrics')
        .select('id,external_product_id,sku,barcode,product_name,units,sales_units,return_units,unit_basis,sales_unit_basis,return_unit_basis,order_line_matches,return_proxy_matches,claim_item_matches,gross_sales,gross_returns,commission_cost,seller_revenue,known_cogs,estimated_profit,estimated_margin,profit_confidence')
        .eq('connection_id', connectionId).gte('day', start).order('id', { ascending: true }).range(from, to))
    ])
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'DATA_TOO_LARGE'
    return json(tooLarge ? 409 : 500, { error: tooLarge ? 'DATA_TOO_LARGE' : 'DB_ERROR' }, origin)
  }

  const cash = aggregateCashRows(daily)
  const other = daily.reduce((acc: any, row: any) => {
    for (const [key, column] of [
      ['grossSales', 'gross_sales'], ['grossReturns', 'gross_returns'], ['commissionCost', 'commission_cost'],
      ['discountCost', 'discount_cost'], ['couponCost', 'coupon_cost'], ['provisionNet', 'provision_net'],
      ['manualRefundNet', 'manual_refund_net'], ['platformPromoNet', 'platform_promo_net'],
      ['deliveryFeeNet', 'delivery_fee_net'], ['correctionNet', 'correction_net']
    ]) acc[key] += cents(row[column])
    acc.transactions += positiveInt(row.transaction_count)
    if (row.settlement_coverage === 'settlement_adjustments_v1') acc.adjustedDays++
    if (row.other_financial_coverage && row.other_financial_coverage !== 'none') acc.otherFinancialDays++
    return acc
  }, {
    grossSales: 0, grossReturns: 0, commissionCost: 0, discountCost: 0, couponCost: 0,
    provisionNet: 0, manualRefundNet: 0, platformPromoNet: 0, deliveryFeeNet: 0, correctionNet: 0,
    transactions: 0, adjustedDays: 0, otherFinancialDays: 0
  })

  const totals = {
    grossSales: moneyFromCents(other.grossSales), grossReturns: moneyFromCents(other.grossReturns),
    commissionCost: moneyFromCents(other.commissionCost), discountCost: moneyFromCents(other.discountCost),
    couponCost: moneyFromCents(other.couponCost), provisionNet: moneyFromCents(other.provisionNet),
    manualRefundNet: moneyFromCents(other.manualRefundNet), platformPromoNet: moneyFromCents(other.platformPromoNet),
    deliveryFeeNet: moneyFromCents(other.deliveryFeeNet), correctionNet: moneyFromCents(other.correctionNet),
    ...cash,
    knownFeeNet: cash.knownCashAfterFeesAndStoppage,
    transactions: other.transactions,
    netSales: moneyFromCents(other.grossSales - other.grossReturns),
    returnRate: other.grossSales ? other.grossReturns / other.grossSales * 100 : 0,
    commissionRate: other.grossSales ? other.commissionCost / other.grossSales * 100 : 0
  }

  const productRows = aggregateProductRows(rawProducts)
  const covered = productRows.filter(product => product.estimatedProfit !== null)
  const missing = productRows.filter(product => product.estimatedProfit === null)
  const worst = [...covered].sort((a, b) => (a.estimatedProfit ?? 0) - (b.estimatedProfit ?? 0)).slice(0, 10)
  const needsCost = [...missing].sort((a, b) => b.grossSales - a.grossSales).slice(0, 10)
  const productCount = productRows.length
  const costCovered = covered.length
  const costCoverage = ratio(costCovered, productCount)
  const totalGross = productRows.reduce((sum, product) => sum + Math.max(0, product.grossSales), 0)
  const coveredGross = covered.reduce((sum, product) => sum + Math.max(0, product.grossSales), 0)
  const salesCostCoverage = ratio(coveredGross, totalGross)
  const coveredSellerRevenue = covered.reduce((sum, product) => sum + product.sellerRevenue, 0)
  const coveredKnownCogs = covered.reduce((sum, product) => sum + (product.knownCogs || 0), 0)
  const coveredProfit = covered.reduce((sum, product) => sum + (product.estimatedProfit || 0), 0)
  const coveredMargin = coveredSellerRevenue ? coveredProfit / coveredSellerRevenue * 100 : null

  const exactSalesGross = rawProducts.reduce((sum, row) => sum + (row.sales_unit_basis === 'order_v2_quantity' ? Math.max(0, Number(row.gross_sales) || 0) : 0), 0)
  const rawGross = rawProducts.reduce((sum, row) => sum + Math.max(0, Number(row.gross_sales) || 0), 0)
  const claimMatchedItems = rawProducts.reduce((sum, row) => sum + positiveInt(row.claim_item_matches), 0)
  const returnProxyItems = rawProducts.reduce((sum, row) => sum + positiveInt(row.return_proxy_matches), 0)
  const returnEvidenceApplicable = claimMatchedItems + returnProxyItems > 0
  const salesEvidenceCoverage = ratio(exactSalesGross, rawGross)
  const returnEvidenceCoverage = returnEvidenceApplicable ? ratio(claimMatchedItems, claimMatchedItems + returnProxyItems) : null
  const dataConfidence = productCount === 0 ? 'no_product_data' : salesCostCoverage === 0 ? 'platform_only' : salesCostCoverage >= .999 ? 'cost_enriched' : 'partial_cost_coverage'

  const dailyOut = daily.map((row: any) => {
    const dayCash = cashSnapshotFromRow(row)
    return {
      day: row.day, currency: row.currency,
      grossSales: moneyFromCents(cents(row.gross_sales)), grossReturns: moneyFromCents(cents(row.gross_returns)),
      commissionCost: moneyFromCents(cents(row.commission_cost)), discountCost: moneyFromCents(cents(row.discount_cost)),
      couponCost: moneyFromCents(cents(row.coupon_cost)), provisionNet: moneyFromCents(cents(row.provision_net)),
      manualRefundNet: moneyFromCents(cents(row.manual_refund_net)), platformPromoNet: moneyFromCents(cents(row.platform_promo_net)),
      deliveryFeeNet: moneyFromCents(cents(row.delivery_fee_net)), correctionNet: moneyFromCents(cents(row.correction_net)),
      ...dayCash,
      knownFeeNet: dayCash.knownCashAfterFeesAndStoppage,
      settlementCoverage: row.settlement_coverage || 'sale_return_core',
      otherFinancialCoverage: row.other_financial_coverage || 'none',
      transactions: positiveInt(row.transaction_count)
    }
  })

  return json(200, {
    connection,
    rangeDays: days,
    startDay: start,
    currency: daily[0]?.currency || 'TRY',
    totals,
    daily: dailyOut,
    products: { count: productCount, costCovered, worst, needsCost },
    profitSnapshot: {
      coveredProducts: costCovered, totalProducts: productCount, coveredGrossSales: coveredGross,
      coveredSellerRevenue, coveredKnownCogs, coveredProfit, coveredMargin,
      scope: 'product_contribution_before_unallocated_store_level_costs'
    },
    settlementSnapshot: {
      coverage: other.adjustedDays === dailyOut.length && dailyOut.length ? 'settlement_adjustments_v1' : other.adjustedDays ? 'partial' : 'sale_return_core',
      adjustedDays: other.adjustedDays, totalDays: dailyOut.length,
      coreSellerRevenue: cash.sellerRevenue, adjustmentNet: cash.settlementAdjustmentNet,
      adjustedSellerRevenue: cash.adjustedSellerRevenue
    },
    otherFinancialSnapshot: {
      coverage: other.otherFinancialDays === dailyOut.length && dailyOut.length ? 'otherfinancials_v1' : other.otherFinancialDays ? 'partial' : 'none',
      coveredDays: other.otherFinancialDays, totalDays: dailyOut.length,
      platformServiceFeeCost: cash.platformServiceFeeCost, cargoCost: cash.cargoCost, stoppageNet: cash.stoppageNet,
      platformCashBeforeStoppage: cash.platformCashBeforeStoppage,
      knownCashAfterFeesAndStoppage: cash.knownCashAfterFeesAndStoppage,
      knownFeeNet: cash.knownCashAfterFeesAndStoppage
    },
    unitSnapshot: {
      totalProducts: productCount, claimMatchedItems, returnProxyItems,
      salesEvidenceCoverage, returnEvidenceCoverage, returnEvidenceApplicable
    },
    dataConfidence,
    costCoverage,
    salesCostCoverage,
    coverage: 'settlement_otherfinancials_stoppage_v2',
    productProfitCoverage: 'cost_enriched_product_contribution'
  }, origin)
})
