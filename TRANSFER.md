# KârKalkan — Transfer Guide

This document defines the clean handover of KârKalkan to a new owner.

## Included assets

- Application source code
- Public website, demo and profitability calculator
- Authenticated seller dashboard
- Supabase database migrations and Edge Function source in the repository
- Marketplace integration code and deterministic financial calculation logic
- Vercel configuration, security headers, routes and deployment configuration
- Product documentation and brand name used in the application

## Do not transfer as credentials

- Seller API keys or API secrets
- User passwords or authentication sessions
- Personal GitHub, Vercel, Supabase, Google or other provider accounts
- Personal access tokens, deployment tokens or local `.env` files
- Supabase database passwords, service-role/secret keys or Vault contents
- Seller-owned developer API keys or outbound webhook signing secrets

The buyer should create or use buyer-owned infrastructure accounts. Secrets must be regenerated during handover.

## Identity-safe source handoff

Git history can contain author names, email addresses and account metadata even when the current source tree is clean. If seller identity privacy matters, **do not hand over the existing `.git` directory as the source package**.

Preferred options:

1. Run `python scripts/build-buyer-bundle.py` and give the buyer the generated history-free ZIP.
2. Buyer creates a fresh repository in a buyer-controlled GitHub account/organization and imports the ZIP as the initial source snapshot.
3. If the existing repository itself is contractually transferred, the buyer should understand that historical Git metadata remains part of that asset unless a separately planned history rewrite is performed.

Do not force-rewrite the public repository immediately before a transaction only to hide metadata; that can break signed commits, PR references, audit provenance and deployment references.

## Recommended handover sequence

1. Generate the history-free buyer bundle and run the pre-sale scan.
2. Buyer creates or selects a buyer-controlled GitHub repository.
3. Buyer creates a new Supabase project.
4. Apply the migrations under `supabase/migrations` in chronological order and deploy the Edge Functions used by the application.
5. Configure the required environment/project values documented in `SETUP.md`.
6. Buyer creates a Vercel project from the buyer-controlled repository and configures production environment values.
7. Deploy and verify `/`, `/uygulama`, `/durum`, `/sss` and `/api/health`.
8. If a custom/canonical domain is part of the transaction, transfer it through the registrar/provider and attach it to the buyer's Vercel project.
9. Buyer creates/rotates all third-party credentials. Do not copy personal credentials from the seller.
10. Perform a production smoke test and, when available, the real marketplace validation protocols documented in `KNOWN_LIMITATIONS.md`.
11. Revoke seller-side access only after the buyer confirms the transferred environment is operational.
12. Rotate/revoke any seller-owned API keys, webhook signing secrets, OAuth refresh tokens and provider sessions that are not explicitly part of the buyer's new environment.

## Vercel note

Generated Vercel preview/deployment aliases may contain the seller team's slug. They are platform metadata, not source code, and should not appear in sale screenshots, documentation or customer-facing links. After the buyer imports/redeploys the project in a buyer-owned team, preview aliases are regenerated for that team. Use only the canonical production domain in public material.

## Acceptance checklist

- [ ] History-free buyer bundle generated and scanned
- [ ] Repository/source accessible to buyer
- [ ] Buyer-controlled Vercel deployment is READY
- [ ] Buyer-controlled Supabase project is operational
- [ ] Database migrations applied
- [ ] Edge Functions deployed with intended JWT settings
- [ ] Authentication works
- [ ] Public demo and calculator work
- [ ] Seller dashboard loads after authentication
- [ ] Provider integration status is disclosed exactly as stated in `KNOWN_LIMITATIONS.md`
- [ ] Buyer-generated secrets are active
- [ ] Seller's personal tokens, sessions and provider secrets are revoked after acceptance
- [ ] Buyer configures its own CODEOWNERS/branch protection/rulesets

## Important disclosure

KârKalkan must never be represented as having completed a marketplace production validation unless that validation has actually been performed and recorded. See `KNOWN_LIMITATIONS.md` and `docs/SALE_READINESS.md`.
