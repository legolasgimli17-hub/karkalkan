# KârKalkan vNext — Product Direction

KârKalkan vNext is intentionally not a feature-for-feature copy of another Trendyol seller dashboard.

## Product question order

The authenticated product is organized around three seller questions:

1. **Şu an ne oluyor?** — fast order-package signals from an authenticated webhook.
2. **Ne kadarı doğrulandı?** — evidence coverage for sales, returns, product cost, cargo allocation and settlement classification.
3. **Nerede para sızıyor olabilir?** — an explainable radar for missing evidence and unusual financial movements.

## Distinctive finance model

A webhook is an early operational signal, not final financial truth. KârKalkan retains periodic reconciliation against settlement, Order V2, accepted claims, Other Financials and cargo evidence. UI copy must preserve the distinction between:

- live signal,
- platform/settlement verified financial data,
- cost-enriched contribution estimates,
- unknown or incomplete evidence.

Never market an incomplete contribution figure as official accounting net profit.

## Explainable Store Score

The score is not AI-generated and must never appear as an unexplained single number. Current components are:

- sales evidence — 25%
- return evidence — 15%
- cost coverage — 25%
- cargo allocation coverage — 15%
- settlement classification coverage — 10%
- data freshness — 10%

Every component and weight is returned to the UI. A buyer can change the weights without changing the underlying evidence measurements.

## Money Leak Radar

The radar identifies places that deserve review. It does not invent a loss amount. Examples include:

- sales without known product cost,
- cargo not allocatable to a product with current evidence,
- unclassified settlement adjustments,
- returns that still rely on proxy matching,
- stale reconciliation.

When an amount is shown it is labeled as an affected basis, not proven loss.

## Visual identity

The vNext console uses an original KârKalkan system:

- obsidian / charcoal surfaces,
- copper / amber decision accents,
- ice-blue evidence/data accents,
- muted red only for actual risk states.

The interface favors a small number of strong panels, plain Turkish labels and evidence hierarchy over a dense module catalog. The main custom visuals are the daily sales/known-cash chart and the sales-to-known-cash bridge.

## Privacy posture

The webhook receiver minimizes stored data. It does not persist customer names, telephone numbers, shipment addresses or invoice addresses. It retains only the order/package/product summary required for the seller-facing live signal and subsequent reconciliation.

## Validation boundary

The backend schema and functions can be structurally verified without a seller account. Actual webhook registration, delivery/retry behavior and the full signal-to-settlement reconciliation path still require a real Trendyol seller account for end-to-end production validation.
