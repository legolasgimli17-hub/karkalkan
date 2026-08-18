# KârKalkan — Known Limitations & Due-Diligence Disclosure

Last reviewed: 2026-08-18

This file separates outstanding marketplace validation from ordinary business, maintenance and infrastructure disclosures. The sections after item 1 are not unresolved application defects.

## 1. Marketplace production validation — outstanding

The Trendyol integration has been implemented against the Partner API flow used by the project. A complete end-to-end production validation with a real Trendyol seller account has not yet been recorded.

The Hepsiburada finance integration has been implemented against the official Basic Auth finance transaction and performance endpoints. The Edge Function is deployed and the schema migration is applied, but no authorized Hepsiburada merchant account was available for first-store reconciliation.

A buyer or tester should validate each full path before claiming real-store production proof:

`account -> store connection -> credentials -> sync -> sales/returns/financial data -> product cost -> profitability output`

For Hepsiburada, compare the same 7-day period in KârKalkan and the merchant finance statement, including payment, return, commission, service fee, cargo and stoppage totals. Record any provider-specific transaction type that lands in the visible unclassified-adjustment list before declaring the integration fully validated.

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

The current Trendyol and Hepsiburada workers deliberately stop at their page/invoice safety ceilings and return `409 SYNC_TOO_LARGE` rather than silently truncating financial data. This is acceptable for the current small/medium-store target, but it is not an automatic continuation system.

Before onboarding stores whose selected sync window can exceed a worker ceiling, implement a resumable job design with:

- a tenant-owned sync-job row containing stage, date window, page/cursor, retry count and lease expiry;
- idempotent page writes plus a unique provider-row/event fingerprint;
- a short worker invocation that commits its continuation cursor after each page or bounded batch;
- `pg_cron`, Supabase Queues or an equivalent scheduler to resume pending jobs;
- terminal `success`, `partial`, `failed` and dead-letter states with externally monitored error codes;
- reconciliation that publishes financial results only after all required chunks for the window complete.

This architecture is intentionally documented, not implemented yet. Raising `MAX_PAGES` alone is not an acceptable substitute because it increases timeout and retry risk without adding resumability.
