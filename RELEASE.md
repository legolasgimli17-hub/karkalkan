# KârKalkan — Acquisition-Ready Baseline

Release baseline: 2026-08-16

This commit marks the cleanup baseline intended for product validation and acquisition due diligence.

## Included in this baseline

- One public product identity: **KârKalkan**
- Stable production URL: `https://karkalkan.vercel.app`
- Canonical authenticated application route: `/uygulama`
- API-free public example experience and free calculator
- Simplified seller-facing language
- Complete checked-in Supabase Edge Function source inventory (13/13)
- Supabase migration history and per-function JWT configuration
- Buyer setup, architecture, transfer, limitation and dependency documentation
- Safe server configuration template
- Pinned browser Supabase client and CSP support for its delivery origin
- Feature-branch → preview → merge → production deployment discipline

## Outstanding validation before claiming full production proof

- Complete a real Trendyol seller-account end-to-end test and record the result.
- Review/enable Supabase leaked-password protection according to the chosen Auth plan/settings.

Historical Vercel deployments remain immutable build/rollback records. They are not separate KârKalkan products and should not be used as customer-facing URLs.
