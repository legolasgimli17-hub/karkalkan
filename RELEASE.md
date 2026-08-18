# KârKalkan — Acquisition-Ready Baseline

Release baseline: 2026-08-16

This baseline records the cleaned product state intended for product validation and acquisition due diligence.

## Included in this baseline

- One public product identity: **KârKalkan**
- Stable production URL: `https://karkalkan.vercel.app`
- Canonical authenticated application route: `/uygulama`
- API-free public example experience and free calculator
- Simplified seller-facing language
- Complete checked-in Supabase Edge Function source inventory (25/25)
- Supabase migration history and per-function JWT configuration
- Buyer setup, architecture, transfer, limitation and dependency documentation
- Safe server configuration template
- Seller-panel DOM/JavaScript contracts aligned for history, product-cost VAT and cost-ledger flows
- Unused browser Supabase CDN dependency removed
- New-account password policy hardened to 12+ characters with mixed character classes
- New-account leaked-password screening through the HIBP Pwned Passwords k-anonymity range API; the plaintext password and full hash are not sent to the service
- Existing-account sign-in remains compatible with passwords created under the previous minimum-length rule
- Feature-branch → preview → verification → production deployment discipline documented

## Outstanding production validation

The only outstanding product-validation item is:

- Complete a real Trendyol seller-account end-to-end test and record the result.

Do not claim real-store Trendyol production proof until that test is completed.

## Platform note

The current Supabase organization is on the Free plan, where Supabase's built-in leaked-password-protection switch is not available. KârKalkan therefore applies leaked-password screening to normal new-account creation at the application layer. This is not represented as the Supabase Pro feature being enabled.

Historical Vercel deployments remain immutable build/rollback records. They are not separate KârKalkan products and should not be used as customer-facing URLs.
