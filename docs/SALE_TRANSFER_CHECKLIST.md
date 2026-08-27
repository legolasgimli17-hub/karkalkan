# KârKalkan — Final Sale & Transfer Checklist

This checklist is for the final handoff of the software asset. It is deliberately conservative: buyer value should come from reproducible source, security controls and clear boundaries—not from hidden seller dependencies or unverifiable claims.

## A. Source privacy and seller identity

- [ ] Public source tree contains no seller name, personal email, personal Vercel team slug or seller-specific CODEOWNERS entry.
- [ ] README and buyer documents use buyer-owned placeholders rather than seller account identifiers.
- [ ] `.gitignore` excludes `.env*` (except `.env.example`), `.vercel/`, `.supabase/`, local key/certificate material and generated bundles.
- [ ] If seller identity privacy is required, deliver `dist/karkalkan-buyer-source.zip` produced by `scripts/build-buyer-bundle.py` or import that bundle into a fresh buyer-owned repository.
- [ ] Do **not** include `.git` in the buyer source ZIP. Git history may contain author names/emails even when the source tree is clean.
- [ ] Do not use generated Vercel preview/deployment URLs in sale screenshots or listings; they can contain the current team slug.

## B. GitHub handoff

- [ ] Buyer controls the destination GitHub account/organization.
- [ ] Buyer creates its own CODEOWNERS configuration after transfer/import.
- [ ] Buyer enables its preferred branch protection/ruleset and required checks.
- [ ] Verify KârKalkan and CodeQL are green on the final source revision.
- [ ] No repository secret, PAT, deploy token or personal SSH/GPG key is transferred as part of source.

## C. Vercel handoff

- [ ] Buyer imports or transfers the project into a buyer-controlled Vercel team.
- [ ] Buyer uses a buyer-controlled canonical domain/alias for public traffic.
- [ ] Buyer configures production environment variables from `.env.example`; seller tokens are not copied.
- [ ] Buyer verifies security headers and canonical routes after redeploy.
- [ ] Old seller-team preview aliases are treated only as historical provider metadata and are not advertised.
- [ ] After buyer acceptance, seller access to the buyer project is removed.

## D. Supabase handoff

Preferred model: buyer creates a fresh Supabase project and rebuilds from version-controlled migrations/functions.

- [ ] Apply all migrations in order.
- [ ] Deploy all Edge Functions with the `verify_jwt` settings from `supabase/config.toml`.
- [ ] Create a new transaction-pooler credential and configure `KARKALKAN_DB_POOLER_URL`.
- [ ] Create/rotate publishable and server-side keys as required by the buyer environment.
- [ ] Re-create third-party secrets only in buyer-controlled Edge Function secrets/Vault.
- [ ] Run Supabase security and performance advisors after migration.
- [ ] Confirm no browser role gained direct access to server-only ledgers, developer API key tables, webhook secret data or rate-limit buckets.
- [ ] Enable native leaked-password protection if available on the buyer plan/project; the app's HIBP client guard is defense in depth, not a reason to skip the platform control.

## E. Secrets that must be re-created or rotated

Never copy a seller's real secret into the buyer package.

- Supabase DB/pooler password and server-side secret keys
- Marketplace credentials and OAuth refresh tokens
- Amazon LWA / SP-API credentials
- Paddle API key, webhook secret and production price IDs
- OpenAI API key
- Sentry configuration
- SMTP / transactional email credentials
- Developer API keys (`kk_live_...`)
- Outbound webhook signing secrets (`whsec_...`)
- Domain registrar / DNS credentials

## F. Production acceptance smoke test

Buyer environment should verify at minimum:

- [ ] `/` loads
- [ ] `/uygulama` loads and auth gating works
- [ ] `/durum` and `/sss` load
- [ ] `/api/health` responds with current component state
- [ ] account registration/login/password recovery works
- [ ] test store connection can be created/deleted
- [ ] secrets do not appear in browser storage, client bundles or logs
- [ ] one bounded import/sync path completes in the buyer environment
- [ ] finance summaries remain deterministic
- [ ] developer API key creation/revocation works if that feature is part of the transaction
- [ ] outbound webhook signature verification is tested against a buyer-controlled endpoint if enabled

## G. Claims that remain evidence-gated

Do not include these in a listing as proven facts unless the buyer receives the corresponding evidence:

- complete KVKK/legal compliance
- real-store reconciliation passed for a marketplace
- live Paddle billing lifecycle verified
- universal timeout-free sync for every provider/store size
- exact universal unique-order quota
- direct Open Banking
- measured uptime/SLA percentage
- AI as the authoritative calculator of finance values

## H. Final seller offboarding

Only after buyer acceptance:

- [ ] revoke seller sessions/tokens that are not needed for retained historical access
- [ ] remove seller access from buyer-controlled GitHub/Vercel/Supabase/provider accounts
- [ ] revoke seller-owned developer API and webhook signing credentials
- [ ] rotate any credential that may have been visible during the transaction
- [ ] keep only transaction records required by the acquisition agreement; do not retain buyer/customer secrets unnecessarily

The intended end state is simple: **buyer owns the accounts, buyer owns the secrets, source is reproducible, seller identity is not required for operation.**
