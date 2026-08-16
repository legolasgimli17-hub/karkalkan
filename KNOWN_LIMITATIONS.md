# KârKalkan — Known Limitations & Due-Diligence Disclosure

Last reviewed: 2026-08-16

This file separates the one outstanding product-validation item from ordinary business, maintenance and infrastructure disclosures. The sections after item 1 are not unresolved application defects.

## 1. Trendyol production validation — outstanding

The Trendyol integration has been implemented against the Partner API flow used by the project. A complete end-to-end production validation with a real Trendyol seller account has not yet been recorded.

**This is the only outstanding product-validation item currently recorded.**

A buyer or tester should validate the full path before claiming real-store production proof:

`account -> store connection -> credentials -> sync -> sales/returns/financial data -> product cost -> profitability output`

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
