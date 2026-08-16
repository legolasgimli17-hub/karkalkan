# KârKalkan vNext direction

KârKalkan is not positioned as a clone of another Trendyol dashboard. The product direction is built around three principles:

1. **Fast signal, verified truth** — webhook order events can surface quickly, while settlement/batch reconciliation remains the financial source of truth.
2. **Evidence before confidence** — every important financial number should expose where it came from and how complete the supporting data is.
3. **Plain Turkish** — seller-facing copy should prefer concrete phrases such as “satıştan kalan”, “kesintiler”, “maliyet kapsamı” and “veri güveni” over accounting jargon unless the accounting term is necessary.

## Visual identity

The application uses an Obsidian + Copper + Ice palette. It intentionally avoids green-first SaaS styling and does not mirror competitor layouts, names, score systems, traffic-light patterns or marketing phrases.

## Product sequence

- Live order signal through Trendyol shipment-package webhooks, with periodic sync retained as reconciliation fallback.
- Daily financial flow and deduction charts.
- Evidence/coverage panel: sales evidence, return evidence, cost coverage, cargo allocation coverage.
- Order-level profitability and estimated → verified state progression.
- Settlement reconciliation and difference investigation.
- Campaign scenario engine tied to the seller's own product costs and known fee profile.
- Seller action center driven by evidence gaps and financial risk, not generic gamification.

Real seller-account end-to-end validation remains required before claiming production verification of Trendyol flows.
