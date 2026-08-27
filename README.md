# KârKalkan

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
- CSV-based normalized finance import and decision support

## One product, one production source

There is only one product: **KârKalkan**. Historical filenames/migrations that contain labels such as `v4` are implementation history, not separate applications. Vercel deployment-specific URLs are immutable build records; customer and advertising traffic should use the stable production URL above.

Production source branch: `main`

Canonical store-panel route: `/uygulama`

Development workflow: `feature branch -> Vercel preview -> verification -> merge to main -> production`

## 10-minute repository map

A buyer should be able to understand the runtime without guessing from filenames.

### Public product / demo surface

| Path | Role | Production status |
| --- | --- | --- |
| `index.html` | Public KârKalkan workspace, product story, synthetic demo and same-page calculator | **Active** — `/` |
| `workspace-v2.css` | Main public workspace layout | **Active** |
| `workspace-demo.js` | Synthetic public finance/demo interactions only | **Active** |
| `product-2026.js` / `product-2026.css` | Public product interactions and presentation layer | **Active** |
| `trendyol-iade-dahil-kar-hesaplama.html` | SEO/education landing page | **Active** |
| `kampanya-basabas-hesaplama.html` | SEO/education landing page | **Active** |
| `pazaryeri-toplu-kar-analizi.html` | SEO/education landing page | **Active** |

### Authenticated seller workspace

| Path | Role | Production status |
| --- | --- | --- |
| `v4.html` | Authenticated workspace HTML shell | **Active** — `/uygulama` rewrites here |
| `v4.js` | Core auth, store connection, sync, costs and dashboard behavior | **Active** |
| `v4-security.js` | Browser-side auth/password/security guards | **Active** |
| `v4-enhance.js` | Workspace enhancement layer | **Active** |
| `v4-alerts.js` | Alert/decision integration and vNext loader | **Active** |
| `v4.css`, `v4-enhance.css`, `v4-alerts.css` | Authenticated workspace styling | **Active** |
| `vnext.js`, `vnext.css`, `vnext-visual.*` | Newer analytics/decision/presentation layer loaded on top of the stable authenticated core | **Active** |
| `sale-ready.*`, `smart-csv.*`, `finance-ai.*`, `bank-reconciliation.*`, `weekly-finance.*` | Bounded feature modules layered onto the authenticated workspace | **Active** |

**Important:** the `v4-*` prefix is historical naming only. It does **not** mean these files are an abandoned prototype. Removing them would break the canonical authenticated application.

### Removed legacy standalone calculator

The older standalone calculator shell and its private browser modules — `hesapla.html`, `app-core.js`, `app-bulk.js` and `app-data.js` — were removed after confirming that their public routes were already compatibility redirects to the current same-page calculator at `/#hesaplayici`. `vercel.json` intentionally keeps `/hesapla` and `/hesapla.html` redirects so old links continue to land on the current product without keeping a second calculator implementation in the repository.

### Backend / data layer

There is no separate production application hidden under a root `api/` directory. The actual server-side application lives under:

- `supabase/functions/` — authenticated/public Edge Functions and shared runtime code
- `supabase/functions/_shared/` — reusable finance, billing, request-security, observability and integration primitives
- `supabase/migrations/` — reproducible Postgres schema/RLS/privilege migrations
- `supabase/config.toml` — per-function JWT verification policy
- `vercel.json` — frontend routing and browser security headers

The public `/api/health` URL is only a Vercel rewrite to `health.json`; it is not a second backend framework.

For deeper runtime/data flow, read `ARCHITECTURE.md`. For a complete function inventory, read `SUPABASE_INVENTORY.md`.

## Acquisition / handover documentation

- `ARCHITECTURE.md` — system and data-flow overview
- `SETUP.md` — clean buyer-owned setup/deployment procedure
- `TRANSFER.md` — asset-transfer and acceptance checklist
- `KNOWN_LIMITATIONS.md` — due-diligence disclosures and outstanding validation
- `SUPABASE_INVENTORY.md` — deployed backend-function inventory and auth configuration
- `THIRD_PARTY.md` — runtime dependency inventory and upgrade policy
- [`docs/BUYER_HANDOFF.md`](docs/BUYER_HANDOFF.md) — buyer-owned infrastructure and secret rotation procedure
- [`docs/SALE_TRANSFER_CHECKLIST.md`](docs/SALE_TRANSFER_CHECKLIST.md) — final pre-sale privacy/security handoff checklist
- [`docs/DEVELOPER_PLATFORM.md`](docs/DEVELOPER_PLATFORM.md) — API keys, Public API v1, webhook signatures and buyer validation
- `.env.example` — safe placeholder names/shapes for server-side configuration
- `scripts/build-buyer-bundle.py` — creates a history-free source ZIP without `.git`, local provider metadata or real environment files

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

Never commit API secrets, seller credentials, personal access tokens or real `.env` files. During a transfer, the buyer should create/rotate secrets in buyer-controlled infrastructure accounts. If seller identity privacy is required, hand over the history-free buyer bundle or a buyer-owned fresh repository rather than the seller's `.git` history.
