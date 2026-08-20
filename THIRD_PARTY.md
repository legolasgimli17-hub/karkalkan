# KârKalkan — Third-Party Runtime Inventory

This file records the runtime dependencies that should be reviewed during acquisition due diligence and future upgrades.

## Browser

- Vercel Web Analytics client — served from the project's own `/_vercel/insights/script.js` route.
- Have I Been Pwned — Pwned Passwords range API, used when a user creates or resets a password. KârKalkan computes SHA-1 locally and sends only the first five hash characters for the k-anonymity range lookup; the plaintext password and full hash are not transmitted. No HIBP API key is stored by KârKalkan.

The authenticated seller panel does not depend on a remotely loaded `@supabase/supabase-js` browser bundle; its Supabase Auth and Edge Function requests use the project's own JavaScript and `fetch`.

## Evidence-bound finance AI

- OpenAI Responses API — optional server-side explanation layer for the `finance-ai` feature when the buyer/operator supplies `OPENAI_API_KEY`.
- The language model is not the calculation authority. Existing deterministic `dashboard-summary` and `decision-center` outputs are reduced to a semantic evidence pack before a model request is made.
- The model payload is designed to exclude marketplace credentials/OAuth tokens, raw orders, customer records, bank descriptions and service-role secrets. It contains the user's short finance question plus aggregate totals, confidence signals, limited aggregate product metrics and money-leak signals.
- Model requests set `store:false`. KârKalkan does not persist AI conversation history in this implementation.
- Model output is accepted only when each finding/action cites evidence IDs that exist in the server-generated evidence pack. Invalid citations or provider failure cause a deterministic evidence-only fallback instead of a fabricated AI answer.
- The endpoint is JWT-protected and database-rate-limited per account. The browser never receives `OPENAI_API_KEY`.
- Before commercial activation, the real operator must review the current provider terms/DPA, data locations/subprocessors, retention controls and any applicable KVKK Article 9 international-transfer mechanism. The checked-in legal pages intentionally remain drafts until that review and the real operator identity/contact details are complete.

## Billing

- Paddle Billing — Merchant of Record and hosted checkout/customer portal. Card details are not collected by KârKalkan. Server-to-server requests use the Paddle API, and incoming events are accepted only after raw-body `Paddle-Signature` verification.
- Production billing is intentionally dormant until the buyer/owner configures an approved Paddle account, checkout domain, webhook destination and recurring price IDs documented in `SETUP.md`.
- Checkout is fail-closed: partial configuration never enables a plan button or transaction creation. Webhook timestamps use a five-second default replay window, configurable only within a bounded range.

## Marketplace partner access

- FLO automatic API access is merchant-specific and approval-gated. KârKalkan stores assigned partner credentials only in Supabase Vault and does not call an undocumented endpoint. The working fallback is the bounded normalized finance-report importer documented in `docs/FLO_PARTNER_ACTIVATION.md`.

## Supabase Edge Functions

The checked-in Edge Functions use version-pinned npm imports where applicable, including:

- `@supabase/supabase-js@2.57.4`
- `postgres@3.4.7`

Individual function source files are the source of truth for their imports.

## Upgrade policy

Before upgrading or replacing a third-party runtime dependency:

1. Review upstream release notes, security guidance, privacy/data-processing terms and license/usage terms.
2. Test authentication, database access and marketplace sync in a preview/test environment.
3. If a browser network origin or delivery method changes, update and re-test Content Security Policy.
4. Keep package versions pinned where packages are imported by version.
5. For security and AI services, fail safely and avoid transmitting secrets or personal data beyond the documented minimum.
6. Re-run the KVKK/international-transfer assessment before enabling a new external AI, analytics, advertising or profiling provider.

This inventory is not a substitute for upstream terms. A buyer should perform their own dependency, privacy and license review as part of due diligence.
