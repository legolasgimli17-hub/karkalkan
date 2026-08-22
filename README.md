# KârKalkan

[![Verify](https://github.com/legolasgimli17-hub/karkalkan/actions/workflows/verify.yml/badge.svg)](https://github.com/legolasgimli17-hub/karkalkan/actions/workflows/verify.yml)
[![CodeQL](https://github.com/legolasgimli17-hub/karkalkan/actions/workflows/codeql.yml/badge.svg)](https://github.com/legolasgimli17-hub/karkalkan/actions/workflows/codeql.yml)

KârKalkan is a multi-marketplace seller profitability product that combines sales/financial data with seller-provided product costs to help answer a simple question: **after deductions and costs, what is left?**

**[Live production](https://karkalkan.vercel.app)** · **[Seller workspace](https://karkalkan.vercel.app/uygulama)**

## Product surfaces

- API-free public example experience
- Free profitability calculator
- Authenticated seller dashboard
- Store connection and server-side marketplace synchronization
- Resumable Trendyol financial synchronization with persisted bounded chunks
- Product-cost enrichment and profitability analysis
- Smart CSV mapping and multi-currency/FX evidence import
- Evidence-bound finance AI
- Scoped read-only Public API v1 and signed outbound webhooks
- CSV/XLSX bulk analysis and campaign scenarios

## One product, one production source

There is only one product: **KârKalkan**. Historical filenames/migrations that contain labels such as `v4` are implementation history, not separate applications. Vercel deployment-specific URLs are immutable build records; customer and advertising traffic should use the stable production URL above.

Production source branch: `main`

Canonical store-panel route: `/uygulama`

Development workflow: `feature branch -> Vercel preview -> verification -> merge to main -> production`

## Acquisition / handover documentation

- `ARCHITECTURE.md` — system and data-flow overview
- `SETUP.md` — clean buyer-owned setup/deployment procedure
- `TRANSFER.md` — asset-transfer and acceptance checklist
- `KNOWN_LIMITATIONS.md` — due-diligence disclosures and outstanding validation
- `SUPABASE_INVENTORY.md` — deployed backend-function inventory and auth configuration
- `THIRD_PARTY.md` — runtime dependency inventory and upgrade policy
- [`docs/DEVELOPER_PLATFORM.md`](docs/DEVELOPER_PLATFORM.md) — API keys, Public API v1, webhook signatures and buyer validation
- `.env.example` — safe placeholder names/shapes for server-side configuration

## Security and engineering governance

- [`SECURITY.md`](SECURITY.md) — private vulnerability reporting and supported-version policy
- [`docs/SECURITY_ARCHITECTURE.md`](docs/SECURITY_ARCHITECTURE.md) — trust boundaries and implemented controls
- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) — protected assets, threats and residual launch gates
- [`docs/SECURITY_REVIEW_2026-08-18.md`](docs/SECURITY_REVIEW_2026-08-18.md) — latest review scope and evidence
- [`docs/CONTROL_PLANE_SECURITY.md`](docs/CONTROL_PLANE_SECURITY.md) — owner-account MFA, recovery and provider activation gates
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — change, testing and secret-handling rules

CI runs the full test suite, JavaScript checks, bundled Edge Function TypeScript validation and CodeQL. GitHub Actions are pinned to immutable revisions; dependency proposals remain review-gated.

## Backend reproducibility

Version-controlled Supabase Edge Function sources live in `supabase/functions/`. Per-function JWT verification settings are recorded in `supabase/config.toml` so the backend can be redeployed into buyer-controlled infrastructure without depending on undocumented dashboard state. Developer API keys are stored only as hashes; outbound webhook signing secrets are stored in Supabase Vault. Amazon Türkiye includes the public-app OAuth handoff and Finances API worker, but activation still depends on buyer-owned Amazon application credentials and approval. FLO supports bounded normalized finance-report import and a Vault-backed private-partner credential handoff; an automatic FLO worker remains gated until FLO supplies the merchant-specific endpoint contract.

The decision center's **Money Leak Radar** is an evidence-weighted financial-confidence system, not a generic store-health score. Non-applicable evidence is excluded from its denominator, and each gap is tied to an affected TL basis and a concrete action without presenting unknown amounts as proven loss.

## Important status

The product is pre-revenue unless later evidence is documented. Do not claim complete real-store Trendyol, Hepsiburada, n11 or Amazon production validation until the end-to-end tests described in `KNOWN_LIMITATIONS.md` have actually been completed. Implemented developer/API capabilities must likewise not be presented as third-party adoption until a buyer-owned external client and webhook endpoint are actually validated.

## Security

Never commit API secrets, seller credentials, personal access tokens or real `.env` files. During a transfer, the buyer should create/rotate secrets in buyer-controlled infrastructure accounts.
