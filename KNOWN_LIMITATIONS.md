# KârKalkan — Known Limitations & Due-Diligence Disclosure

Last reviewed: 2026-08-16

## 1. Trendyol production validation

The Trendyol integration has been implemented against the Partner API flow used by the project. A complete end-to-end production validation with a real Trendyol seller account has not yet been recorded. This is the largest outstanding product-validation item.

A buyer or tester should validate the full path before claiming production proof:

`account -> store connection -> credentials -> sync -> sales/returns/financial data -> product cost -> profitability output`

## 2. Pre-revenue status

KârKalkan is currently a pre-revenue product. No recurring revenue, paid customer cohort or retention history should be implied unless separately documented with evidence after this file's review date.

## 3. Public demo data

The public demo uses example data. It is intentionally labelled as an example and must not be presented as a real seller's store data.

## 4. Trust / onboarding

A real automated store connection requires marketplace credentials. The public product therefore leads with an API-free demo and calculator before asking a seller to connect a store. Brand trust remains a go-to-market risk for a new product.

## 5. Stage environment / IP allowlisting

If a Trendyol test/stage workflow requires a fixed outbound IP, the current serverless architecture may require a fixed-egress proxy or other approved networking solution. Confirm current Trendyol and infrastructure requirements before implementation.

## 6. Version naming

Historical source filenames and database migration names can contain `v4`. They are historical implementation identifiers, not separate products. Public-facing navigation should use the single product name **KârKalkan**. Historical migrations should not be renamed after they have been applied because migration history is part of database provenance.

## 7. Marketplace/API change risk

Marketplace endpoints, financial semantics, authentication rules, rate limits and data fields can change. The integration must be maintained against current official marketplace documentation.

## 8. No valuation guarantee

Source code, deployment and documentation make the product transferable, but do not guarantee a particular acquisition price, user growth or revenue outcome.
