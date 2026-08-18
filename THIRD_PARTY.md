# KârKalkan — Third-Party Runtime Inventory

This file records the runtime dependencies that should be reviewed during acquisition due diligence and future upgrades.

## Browser

- Vercel Web Analytics client — served from the project's own `/_vercel/insights/script.js` route.
- Have I Been Pwned — Pwned Passwords range API, used only when a user attempts to create a new account. KârKalkan computes SHA-1 locally and sends only the first five hash characters for the k-anonymity range lookup; the plaintext password and full hash are not transmitted. No HIBP API key is stored by KârKalkan.

The authenticated seller panel does not depend on a remotely loaded `@supabase/supabase-js` browser bundle; its Supabase Auth and Edge Function requests use the project's own JavaScript and `fetch`.

## Billing

- Paddle Billing — Merchant of Record and hosted checkout/customer portal. Card and invoice data are not collected by KârKalkan. Server-to-server requests use the Paddle API, and incoming events are accepted only after raw-body `Paddle-Signature` verification.
- Production billing is intentionally dormant until the buyer/owner configures an approved Paddle account, checkout domain, webhook destination and recurring price IDs documented in `SETUP.md`.

## Supabase Edge Functions

The checked-in Edge Functions use version-pinned npm imports where applicable, including:

- `@supabase/supabase-js@2.57.4`
- `postgres@3.4.7`

Individual function source files are the source of truth for their imports.

## Upgrade policy

Before upgrading or replacing a third-party runtime dependency:

1. Review upstream release notes, security guidance and license/usage terms.
2. Test authentication, database access and marketplace sync in a preview/test environment.
3. If a browser network origin or delivery method changes, update and re-test Content Security Policy.
4. Keep package versions pinned where packages are imported by version.
5. For security services, fail safely and avoid transmitting secrets beyond what the documented protocol requires.

This inventory is not a substitute for upstream terms. A buyer should perform their own dependency/license review as part of due diligence.
