# KârKalkan — Supabase Inventory

Snapshot reviewed: 2026-08-18

The production Supabase project contains the following application Edge Functions. This inventory exists so an acquisition does not depend on undocumented infrastructure.

| Function | Auth expectation | Purpose / status | Source in repo |
|---|---|---|---|
| `marketplace-connections` | Custom bearer-token validation in function body; platform JWT check disabled | Store connection CRUD | Yes |
| `dashboard-summary` | JWT required | Canonical dashboard cash / cost-coverage summary | Yes |
| `product-costs` | JWT required | Product cost CRUD | Yes |
| `trendyol-credentials` | JWT required | Secure Trendyol credential handling | Yes |
| `marketplace-credentials` | JWT required | Provider-aware Vault credential/OAuth-token status for Trendyol, Hepsiburada, n11 and Amazon | Yes |
| `marketplace-import` | JWT required | Normalized, tenant-isolated CSV finance import for every provider | Yes |
| `trendyol-sync` | JWT required | Core Trendyol reconciliation/synchronization | Yes |
| `hepsiburada-sync` | JWT required | Hepsiburada finance transactions and product-performance synchronization | Yes |
| `n11-sync` | JWT required | n11 shipment-package economics and approved-return synchronization; final cargo/statement reconciliation remains report-backed | Yes |
| `amazon-auth-start` | JWT required | Creates the Amazon Turkey Seller Central consent URL with short-lived state | Yes |
| `amazon-auth-login` | JWT required | Authenticated website Log-in URI handoff; validates Amazon callback host and binds authorization to a tenant connection | Yes |
| `amazon-auth-callback` | Platform JWT disabled; one-use OAuth state required | Exchanges Amazon's short-lived authorization code and stores the refresh token in Vault | Yes |
| `amazon-sync` | JWT required | Amazon Turkey Finances API v2024-06-19 transaction and product-profit synchronization | Yes |
| `sync-history` | JWT required | Sync history | Yes |
| `connection-health` | JWT required | Connection health/status | Yes |
| `product-costs-bulk` | JWT required | Bulk product cost operations | Yes |
| `trendyol-otherfinancials-sync` | JWT required | Other financial movements, stoppage, cargo and allocation sync | Yes |
| `trendyol-cargo-sync` | JWT required | Cargo financial data sync | Yes |
| `risk-alerts` | JWT required | Rule-based financial attention signals | Yes |
| `webhook-manager` | JWT required | User-authorized Trendyol webhook provider reconciliation / rotation | Yes |
| `order-events` | Platform JWT disabled; per-connection `x-api-key` SHA-256 verification in function | External order-event callback receiver | Yes |
| `live-overview` | JWT required | Tenant-isolated live order signal summary | Yes |
| `decision-center` | JWT required | Explainable financial-data confidence and money-leak evidence radar | Yes |
| `operating-expenses` | JWT required | Tenant-isolated operating-expense ledger | Yes |
| `portfolio-summary` | JWT required | Multi-store cash, cost coverage and operating-contribution summary | Yes |
| `billing-summary` | JWT required | Tenant subscription, usage and plan catalog | Yes |
| `billing-checkout` | JWT required | Paddle hosted-checkout transaction creation | Yes |
| `billing-portal` | JWT required | Temporary Paddle customer-portal session creation | Yes |
| `billing-webhook` | Paddle raw-body signature; platform JWT disabled | Idempotent subscription/customer lifecycle ingestion | Yes |
| `v4-auth` | JWT required | Retired endpoint; returns HTTP 410 | Yes |
| `v4-beta` | JWT required | Retired endpoint; returns HTTP 410 | Yes |

## Source completeness

All 31 application Edge Function sources are checked into `supabase/functions/`.

Per-function JWT verification settings are recorded in `supabase/config.toml`. `marketplace-connections` performs its own bearer-token validation. `order-events` is intentionally callable without a Supabase JWT because the external marketplace callback does not possess one; `billing-webhook` likewise authenticates Paddle using its raw-body HMAC signature. `amazon-auth-callback` accepts Amazon's redirect without a Supabase JWT but requires a valid, unexpired, one-use state bound to the user and connection. All other active application functions require a valid Supabase JWT.

## Canonical finance vocabulary

Seller-facing financial services use the same staged vocabulary:

1. `adjustedSellerRevenue`: sale/return core plus imported settlement adjustments.
2. `platformCashBeforeStoppage`: adjusted seller revenue minus known platform-service and cargo charges.
3. `knownCashAfterFeesAndStoppage`: the previous value minus imported e-commerce stoppage. Product cost is not yet removed.
4. Product contribution is shown only for product/days where product cost is known.
5. Portfolio `operatingContribution` is returned only when sales-weighted product-cost coverage is complete; otherwise it is `null`/unknown rather than treating missing cost as zero.

These values must not be described as accounting or tax net profit.

## Data-size correctness guard

Financial summary endpoints do not rely on the Data API's first response page for potentially large datasets. `dashboard-summary`, `risk-alerts`, `decision-center` and `portfolio-summary` page through their source rows and fail explicitly with `DATA_TOO_LARGE` at the configured safety ceiling instead of silently returning a partial financial total. The operating-expense ledger likewise returns an explicit `EXPENSE_LEDGER_TOO_LARGE` error beyond its review ceiling.

## Edge database connection safety

Every Edge Function that uses `postgres.js` reads the custom `KARKALKAN_DB_POOLER_URL` secret and obtains its client from `_shared/postgres.ts`. Supabase's platform-provided `SUPABASE_DB_URL` remains a reserved direct connection and is intentionally not used. The factory accepts only Supabase transaction-pooler hosts on port `6543`, forces `prepare:false` and caps each isolate at `max:1`. A direct `:5432` URL is rejected with a configuration error before a connection is opened.

## External error monitoring

`_shared/observability.ts` provides pinned Sentry Deno integration. With `SENTRY_DSN` configured, `trendyol-sync`, `hepsiburada-sync`, `n11-sync`, `amazon-sync` and Amazon's OAuth workers report safe failure codes. Default PII is disabled and monitoring calls receive no request body, seller credentials, OAuth token or database URL. Without a DSN, the helper is a safe no-op and Supabase runtime logs remain available.

## Live order signal model

KârKalkan does not treat a webhook event as final financial truth. The live layer is deliberately split into two stages:

1. `webhook-manager` uses the seller-authorized credentials already stored in Vault, lists provider-side webhooks and reconciles local status with the actual Trendyol status.
2. Creating/repairing the live connection rotates a unique callback key; only its SHA-256 hash is stored locally. Existing provider subscriptions are updated/reactivated instead of blindly trusting a local `active` flag.
3. `order-events` authenticates the incoming callback, deduplicates retries with an event fingerprint and stores a PII-minimized order signal.
4. `live-overview` exposes only the authenticated user's own recent signal state.
5. Settlement/order/claim/cargo synchronizers remain the source of later financial reconciliation.

The related database objects are version controlled in `20260816180000_add_live_order_signal_layer.sql`. The three live-signal tables have RLS enabled, owner policies, composite ownership foreign keys, no anonymous table privileges, and authenticated browser access limited to `SELECT`.

The callback storage intentionally excludes customer name, telephone and address fields. Only the minimum order/package/product summary required for the live seller signal is retained.

## Financial data confidence

`decision-center` is not a commercial 'store health' score and is not an opaque AI score. It measures confidence in the financial evidence. Its visible inputs include sales evidence, applicable return evidence, sales-weighted product-cost coverage, applicable cargo-allocation coverage, applicable settlement-classification coverage and data freshness.

A component that has no meaningful denominator in the selected period is marked non-applicable and excluded from the weighted denominator instead of being awarded an artificial 0 or 100. The same endpoint produces the money-leak radar for evidence gaps such as missing product cost, unallocated cargo, unclassified settlement adjustments and stale reconciliation.

The radar never labels an unknown amount as proven financial loss. It reports the affected basis separately and explains why the signal needs review.

## Browser privilege hardening

Synchronization artifacts such as `marketplace_cargo_invoice_items`, `marketplace_order_product_map` and `marketplace_product_cargo_allocations` are browser-read-only. Broad browser write/TRUNCATE/TRIGGER grants were removed in the reviewed hardening migration. Composite ownership foreign keys for the live-signal and operating-expense tables have matching `(connection_id, user_id)` indexes.

## Transfer requirement

During handover, the buyer should deploy the repository functions into a buyer-controlled Supabase project, apply the migrations, configure buyer-generated secrets, and run the acceptance checklist in `TRANSFER.md`.

A transferred project must create its own marketplace webhook subscriptions. Never transfer the current callback secret, seller API secrets, user sessions, personal access tokens or personal infrastructure accounts.

## Security review snapshot

Supabase Security Advisor currently reports only the platform-level leaked-password-protection warning on the Free plan. KârKalkan's normal new-account flow compensates at the application layer by requiring a stronger password policy and checking the completed password against the Have I Been Pwned Pwned Passwords range API using k-anonymity before signup. This must not be described as Supabase's managed leaked-password-protection feature being enabled.

Performance Advisor currently reports unused-index INFO entries. The product does not yet have representative workload telemetry, so those INFO entries are not sufficient evidence to remove indexes needed for ownership/FK and expected access paths.
