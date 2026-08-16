# KârKalkan — Supabase Inventory

Snapshot reviewed: 2026-08-16

The production Supabase project currently contains the following Edge Functions. This inventory exists so an acquisition does not depend on undocumented infrastructure.

| Function | Auth expectation | Purpose / status |
|---|---|---|
| `marketplace-connections` | Performs custom bearer-token validation in function body | Store connection CRUD |
| `dashboard-summary` | JWT required | Dashboard financial summary |
| `product-costs` | JWT required | Product cost CRUD |
| `trendyol-credentials` | JWT required | Secure Trendyol credential handling |
| `trendyol-sync` | JWT required | Core Trendyol synchronization |
| `sync-history` | JWT required | Sync history |
| `connection-health` | JWT required | Connection health/status |
| `product-costs-bulk` | JWT required | Bulk product cost operations |
| `trendyol-otherfinancials-sync` | JWT required | Other financial movements sync |
| `trendyol-cargo-sync` | JWT required | Cargo financial data sync |
| `risk-alerts` | JWT required | Seller risk/attention signals |
| `v4-auth` | JWT required | Retired endpoint; returns HTTP 410 |
| `v4-beta` | JWT required | Retired endpoint; returns HTTP 410 |

## Transfer requirement

Before final acquisition handover, export the source of every active non-retired Edge Function into the transferred source repository or otherwise provide the buyer with an auditable source bundle. At the time of this snapshot, the GitHub repository contains database migrations but does **not** contain a complete checked-in copy of all deployed Edge Function source.

This is therefore a **handover blocker**, not a hidden issue. The production functions are present in Supabase and can be retrieved, but the acquisition package is not complete until their source is included in the transferred assets.

## Security review snapshot

Supabase security advisor currently reports one warning: leaked-password protection is disabled in Auth. This is a hardening recommendation rather than evidence of a breach. Enable it when the selected Supabase plan/configuration supports the desired setting, or disclose the setting during due diligence.

Performance advisor currently reports multiple indexes as unused. Because the product is new/pre-revenue and has little production workload, unused-index telemetry is not sufficient evidence that those indexes should be deleted. Re-evaluate with representative traffic before removing indexes.
