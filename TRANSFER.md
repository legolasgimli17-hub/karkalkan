# KârKalkan — Transfer Guide

This document defines the clean handover of KârKalkan to a new owner.

## Included assets

- GitHub source repository and commit history
- Public website, demo and profitability calculator
- Authenticated seller dashboard
- Supabase database migrations and Edge Function source in the repository
- Trendyol integration code and financial calculation logic
- Vercel configuration, security headers, routes and deployment configuration
- Product documentation and brand name used in the application

## Not included / must never be transferred as credentials

- Seller API keys or API secrets
- User passwords or authentication sessions
- Personal GitHub, Vercel, Supabase or Google accounts
- Personal access tokens, deployment tokens or local `.env` files

The buyer should create or use their own infrastructure accounts. Secrets must be regenerated during handover.

## Recommended handover sequence

1. Transfer the repository to the buyer or buyer organization, or provide a clean repository copy as agreed in the acquisition contract.
2. Buyer creates a new Supabase project.
3. Apply the migrations under `supabase/migrations` in chronological order and deploy the Edge Functions used by the application.
4. Configure the required environment/project values documented in `SETUP.md`.
5. Buyer creates a Vercel project from the transferred repository and configures production environment values.
6. Deploy and verify `/`, `/demo`, `/hesapla`, authentication, dashboard and `/api/health`.
7. If a custom domain is part of the transaction, transfer it through the registrar and attach it to the buyer's Vercel project.
8. Buyer creates/rotates all third-party credentials. Do not copy personal credentials from the seller.
9. Perform a production smoke test and, when available, a real Trendyol seller end-to-end validation.
10. Revoke seller-side access after the buyer confirms the transferred environment is operational.

## Acceptance checklist

- [ ] Repository accessible to buyer
- [ ] Buyer-controlled Vercel deployment is READY
- [ ] Buyer-controlled Supabase project is operational
- [ ] Database migrations applied
- [ ] Edge Functions deployed
- [ ] Authentication works
- [ ] Public demo and calculator work
- [ ] Seller dashboard loads after authentication
- [ ] Trendyol integration status disclosed and verified to the level stated in `KNOWN_LIMITATIONS.md`
- [ ] Buyer-generated secrets are active
- [ ] Seller's personal tokens and sessions are revoked

## Important disclosure

KârKalkan must never be represented as having completed real-store Trendyol production validation unless that validation has actually been performed and recorded. See `KNOWN_LIMITATIONS.md`.
