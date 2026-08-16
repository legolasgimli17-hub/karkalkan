# KârKalkan — Supabase Inventory

Snapshot reviewed: 2026-08-16

The production Supabase project currently contains the following Edge Functions. This inventory exists so an acquisition does not depend on undocumented infrastructure.

| Function | Auth expectation | Purpose / status | Source in repo |
|---|---|---|---|
| `marketplace-connections` | Custom bearer-token validation in function body; platform JWT check disabled | Store connection CRUD | Yes |
| `dashboard-summary` | JWT required | Dashboard financial summary | Yes |
| `product-costs` | JWT required | Product cost CRUD | Yes |
| `trendyol-credentials` | JWT required | Secure Trendyol credential handling | Yes |
| `trendyol-sync` | JWT required | Core Trendyol synchronization | Yes |
| `sync-history` | JWT required | Sync history | Yes |
| `connection-health` | JWT required | Connection health/status | Yes |
| `product-costs-bulk` | JWT required | Bulk product cost operations | Yes |
| `trendyol-otherfinancials-sync` | JWT required | Other financial movements, stoppage, cargo and allocation sync | Yes |
| `trendyol-cargo-sync` | JWT required | Cargo financial data sync | Yes |
| `risk-alerts` | JWT required | Seller risk/attention signals | Yes |
| `v4-auth` | JWT required | Retired endpoint; returns HTTP 410 | Yes |
| `v4-beta` | JWT required | Retired endpoint; returns HTTP 410 | Yes |

## Source completeness

All 13 currently deployed Edge Function sources are checked into `supabase/functions/`.

Per-function JWT verification settings are recorded in `supabase/config.toml`. The production project currently has `marketplace-connections` with platform `verify_jwt = false`; the function performs its own bearer-token validation. All other listed functions have platform JWT verification enabled.

## Transfer requirement

During handover, the buyer should deploy the repository functions into a buyer-controlled Supabase project, apply the migrations, configure buyer-generated secrets, and run the acceptance checklist in `TRANSFER.md`.

Do not transfer seller API secrets, user sessions, personal access tokens or personal infrastructure accounts.

## Security review snapshot

The current Supabase organization is on the Free plan. Supabase Security Advisor reports that the platform-level leaked-password-protection feature is disabled; that built-in feature is not available on the current plan.

KârKalkan's normal new-account flow now compensates at the application layer by requiring a stronger password policy and checking the completed password against the Have I Been Pwned Pwned Passwords range API using k-anonymity before the signup request is sent to Supabase. The browser sends only a five-character SHA-1 prefix for that range lookup; it does not send the plaintext password or full hash. Existing-account login remains backward compatible with credentials created under the earlier password-length rule.

This application-layer control must not be described as Supabase's Pro leaked-password-protection feature being enabled. A future buyer moving the project to a plan that includes the platform feature should enable it as defense in depth.

Performance advisor currently reports multiple indexes as unused. Because the product is new/pre-revenue and has little representative production workload, unused-index telemetry is not sufficient evidence that those indexes should be deleted. Re-evaluate with real traffic before removing indexes.
