# KârKalkan — Known Limitations & Due-Diligence Disclosure

Last reviewed: 2026-08-18

This file separates outstanding marketplace validation from ordinary business, maintenance and infrastructure disclosures. The sections after item 1 are not unresolved application defects.

## 1. Marketplace production validation — outstanding

The Trendyol integration has been implemented against the Partner API flow used by the project. A complete end-to-end production validation with a real Trendyol seller account has not yet been recorded.

The Hepsiburada finance integration has been implemented against the official Basic Auth finance transaction and performance endpoints. The Edge Function is deployed and the schema migration is applied, but no authorized Hepsiburada merchant account was available for first-store reconciliation.

The n11 integration has been implemented against the official shipment-package REST API and approved-return SOAP API. It calculates order-level commission, service-fee and stoppage estimates from the provider fields, but n11 exposes final cargo and some account-statement adjustments through payment-detail reports rather than the public order API. No authorized n11 merchant account was available for first-store reconciliation.

The Amazon Türkiye public-app OAuth handoff and Finances API v2024-06-19 worker are implemented. The flow validates one-use state, stores the LWA refresh token in Vault, calls the Europe endpoint for marketplace `A33AVAJ2PDY3EV`, and imports only non-deferred TRY transactions. No buyer-owned Amazon application credentials, role approval or authorized seller account were available for production reconciliation. Amazon financial events can lag by up to 48 hours, and item-level profit detail depends on item breakdown/context coverage in Amazon's response.

FLO's operational path is the bounded normalized finance-report importer. The application can store the merchant-specific FLO partner username and password in Vault, but it deliberately keeps the connection approval-gated: FLO has not supplied this project with an official base URL, endpoint/schema contract or an authorized merchant account. No automatic endpoint has been invented, and stored credentials alone do not mark the provider as verified.

A buyer or tester should validate each full path before claiming real-store production proof:

`account -> store connection -> credentials -> sync -> sales/returns/financial data -> product cost -> profitability output`

For Hepsiburada, compare the same 7-day period in KârKalkan and the merchant finance statement, including payment, return, commission, service fee, cargo and stoppage totals. Record any provider-specific transaction type that lands in the visible unclassified-adjustment list before declaring the integration fully validated.

For n11, compare a 7-day period against Seller Office and the payment-detail report. Automatic API results must remain labelled as order-based estimates until cargo and final statement adjustments are reconciled through that report.

For Amazon, complete the draft OAuth flow first, then compare an older, closed 7-day window against the same Seller Central transaction/settlement period. Verify gross product charges, refunds, commission, fulfillment/delivery fees, other Amazon fees, transaction totals, product quantities and any visible unclassified top-level breakdown type before changing the provider from approval-gated to live-verified.

For FLO, first reconcile the normalized report import against a closed merchant statement. If FLO later supplies a private API contract, preserve raw provider transaction identifiers, map only documented financial fields, keep unknown adjustments visible, and reconcile the automatic output against that same report before promoting the provider.

## 2. Pre-revenue status — business disclosure

KârKalkan is currently a pre-revenue product. No recurring revenue, paid customer cohort or retention history should be implied unless separately documented with evidence after this file's review date.

## 3. Public demo data — product disclosure

The public demo uses example data. It is intentionally labelled as an example and must not be presented as a real seller's store data.

## 4. Trust / onboarding — go-to-market disclosure

A real automated store connection requires marketplace credentials. The public product therefore leads with an API-free demo and calculator before asking a seller to connect a store. Brand trust is a go-to-market challenge for any new product; it is not an application defect.

## 5. Stage environment / IP allowlisting — future infrastructure condition

If a Trendyol test/stage workflow requires a fixed outbound IP, the current serverless architecture may require a fixed-egress proxy or another approved networking solution. Confirm current Trendyol and infrastructure requirements before implementing a stage-only workflow.

## 6. Version naming — historical provenance

Historical source filenames and database migration names can contain `v4`. They are historical implementation identifiers, not separate products. Public-facing navigation uses the single product name **KârKalkan**. Historical migrations should not be renamed after they have been applied because migration history is part of database provenance.

## 7. Marketplace/API change risk — maintenance disclosure

Marketplace endpoints, financial semantics, authentication rules, rate limits and data fields can change. The integration must be maintained against current official marketplace documentation. This is normal maintenance risk for an external-API product.

## 8. No valuation guarantee — transaction disclosure

Source code, deployment and documentation make the product transferable, but do not guarantee a particular acquisition price, user growth or revenue outcome.

## 9. Very large-store synchronization — documented capacity boundary

The current Trendyol, Hepsiburada, n11 and Amazon workers deliberately stop at their page/invoice safety ceilings and return `409 SYNC_TOO_LARGE` rather than silently truncating financial data. This is acceptable for the current small/medium-store target, but it is not an automatic continuation system.

Before onboarding stores whose selected sync window can exceed a worker ceiling, implement a resumable job design with:

- a tenant-owned sync-job row containing stage, date window, page/cursor, retry count and lease expiry;
- idempotent page writes plus a unique provider-row/event fingerprint;
- a short worker invocation that commits its continuation cursor after each page or bounded batch;
- `pg_cron`, Supabase Queues or an equivalent scheduler to resume pending jobs;
- terminal `success`, `partial`, `failed` and dead-letter states with externally monitored error codes;
- reconciliation that publishes financial results only after all required chunks for the window complete.

This architecture is intentionally documented, not implemented yet. Raising `MAX_PAGES` alone is not an acceptable substitute because it increases timeout and retry risk without adding resumability.
