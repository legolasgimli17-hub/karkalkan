export const PAGE_SIZE = 1000;
export const MAX_ROWS = 100000;

export function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function cents(value) {
  return Math.round(numberValue(value) * 100);
}

export function moneyFromCents(value) {
  return Math.round(numberValue(value)) / 100;
}

export function money(value) {
  return Math.round(numberValue(value) * 100) / 100;
}

export function positiveInt(value) {
  return Math.max(0, Math.trunc(numberValue(value)));
}

export function signedInt(value) {
  return Math.trunc(numberValue(value));
}

export function clamp01(value) {
  return Math.max(0, Math.min(1, numberValue(value)));
}

export function ratio(numerator, denominator) {
  const d = numberValue(denominator);
  return d ? clamp01(numberValue(numerator) / d) : 0;
}

export function percent(value) {
  return Math.round(numberValue(value) * 100) / 100;
}

export async function readAllPages(makePage, options = {}) {
  const pageSize = Number(options.pageSize || PAGE_SIZE);
  const maxRows = Number(options.maxRows || MAX_ROWS);
  const rows = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const result = await makePage(from, from + pageSize - 1);
    if (result?.error) throw result.error;
    const page = Array.isArray(result?.data) ? result.data : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }

  throw new Error('DATA_TOO_LARGE');
}

export function cashSnapshotFromRow(row = {}) {
  const sellerRevenue = cents(row.seller_revenue ?? row.sellerRevenue);
  const settlementAdjustmentNet = cents(row.settlement_adjustment_net ?? row.settlementAdjustmentNet);
  const platformServiceFeeCost = cents(row.platform_service_fee_cost ?? row.platformServiceFeeCost);
  const cargoCost = cents(row.cargo_cost ?? row.cargoCost);
  const stoppageNet = cents(row.stoppage_net ?? row.stoppageNet);
  const adjustedSellerRevenue = sellerRevenue + settlementAdjustmentNet;
  const platformCashBeforeStoppage = adjustedSellerRevenue - platformServiceFeeCost - cargoCost;
  const knownCashAfterFeesAndStoppage = platformCashBeforeStoppage - stoppageNet;

  return {
    sellerRevenue: moneyFromCents(sellerRevenue),
    settlementAdjustmentNet: moneyFromCents(settlementAdjustmentNet),
    adjustedSellerRevenue: moneyFromCents(adjustedSellerRevenue),
    platformServiceFeeCost: moneyFromCents(platformServiceFeeCost),
    cargoCost: moneyFromCents(cargoCost),
    stoppageNet: moneyFromCents(stoppageNet),
    platformCashBeforeStoppage: moneyFromCents(platformCashBeforeStoppage),
    knownCashAfterFeesAndStoppage: moneyFromCents(knownCashAfterFeesAndStoppage)
  };
}

export function aggregateCashRows(rows = []) {
  let sellerRevenue = 0;
  let settlementAdjustmentNet = 0;
  let platformServiceFeeCost = 0;
  let cargoCost = 0;
  let stoppageNet = 0;

  for (const row of rows) {
    sellerRevenue += cents(row.seller_revenue ?? row.sellerRevenue);
    settlementAdjustmentNet += cents(row.settlement_adjustment_net ?? row.settlementAdjustmentNet);
    platformServiceFeeCost += cents(row.platform_service_fee_cost ?? row.platformServiceFeeCost);
    cargoCost += cents(row.cargo_cost ?? row.cargoCost);
    stoppageNet += cents(row.stoppage_net ?? row.stoppageNet);
  }

  const adjustedSellerRevenue = sellerRevenue + settlementAdjustmentNet;
  const platformCashBeforeStoppage = adjustedSellerRevenue - platformServiceFeeCost - cargoCost;
  const knownCashAfterFeesAndStoppage = platformCashBeforeStoppage - stoppageNet;

  return {
    sellerRevenue: moneyFromCents(sellerRevenue),
    settlementAdjustmentNet: moneyFromCents(settlementAdjustmentNet),
    adjustedSellerRevenue: moneyFromCents(adjustedSellerRevenue),
    platformServiceFeeCost: moneyFromCents(platformServiceFeeCost),
    cargoCost: moneyFromCents(cargoCost),
    stoppageNet: moneyFromCents(stoppageNet),
    platformCashBeforeStoppage: moneyFromCents(platformCashBeforeStoppage),
    knownCashAfterFeesAndStoppage: moneyFromCents(knownCashAfterFeesAndStoppage)
  };
}

export function salesCostCoverage(rows = []) {
  let gross = 0;
  let coveredGross = 0;
  let knownCogs = 0;

  for (const row of rows) {
    const rowGross = Math.max(0, numberValue(row.gross_sales ?? row.grossSales));
    gross += rowGross;
    if ((row.known_cogs ?? row.knownCogs) !== null && (row.known_cogs ?? row.knownCogs) !== undefined) {
      coveredGross += rowGross;
      knownCogs += numberValue(row.known_cogs ?? row.knownCogs);
    }
  }

  const coverage = gross > 0 ? clamp01(coveredGross / gross) : 0;
  return {
    grossSales: money(gross),
    coveredGrossSales: money(coveredGross),
    knownCogs: money(knownCogs),
    coverage,
    complete: gross > 0 && coverage >= 0.999
  };
}

export function contributionAfterKnownCosts({
  knownCashAfterFeesAndStoppage,
  knownCogs,
  operatingExpenses = 0,
  costCoverage = 0,
  hasSales = true
} = {}) {
  if (!hasSales || numberValue(costCoverage) < 0.999) return null;
  return money(
    numberValue(knownCashAfterFeesAndStoppage) -
    numberValue(knownCogs) -
    numberValue(operatingExpenses)
  );
}

export function overlapShare(rangeStart, rangeEnd, expenseStart, expenseEnd) {
  const utcDay = (value) => Date.parse(`${value}T00:00:00Z`);
  const overlapStart = Math.max(utcDay(rangeStart), utcDay(expenseStart));
  const overlapEnd = Math.min(utcDay(rangeEnd), utcDay(expenseEnd));
  if (overlapEnd < overlapStart) return 0;
  const overlapDays = (overlapEnd - overlapStart) / 86400000 + 1;
  const expenseDays = (utcDay(expenseEnd) - utcDay(expenseStart)) / 86400000 + 1;
  return expenseDays > 0 ? overlapDays / expenseDays : 0;
}
