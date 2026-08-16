# KârKalkan

KârKalkan is a Trendyol-focused seller profitability product that combines marketplace sales/financial data with seller-provided product costs to help answer a simple question: **after deductions and costs, what is left?**

Live production: `https://karkalkan.vercel.app`

## Product surfaces

- API-free public example experience
- Free profitability calculator
- Authenticated seller dashboard
- Store connection and server-side marketplace synchronization
- Product-cost enrichment and profitability analysis
- CSV/XLSX bulk analysis and campaign scenarios

## One product, one production source

There is only one product: **KârKalkan**. Historical filenames/migrations that contain labels such as `v4` are implementation history, not separate applications. Vercel deployment-specific URLs are immutable build records; customer and advertising traffic should use the stable production URL above.

Production source branch: `main`

Development workflow: `feature branch -> Vercel preview -> verification -> merge to main -> production`

## Acquisition / handover documentation

- `ARCHITECTURE.md` — system and data-flow overview
- `SETUP.md` — clean buyer-owned setup/deployment procedure
- `TRANSFER.md` — asset-transfer and acceptance checklist
- `KNOWN_LIMITATIONS.md` — due-diligence disclosures and outstanding validation
- `SUPABASE_INVENTORY.md` — deployed backend-function inventory and auth configuration

## Backend reproducibility

All 13 currently deployed Supabase Edge Function sources are checked into `supabase/functions/`. Per-function JWT verification settings are recorded in `supabase/config.toml` so the backend can be redeployed into buyer-controlled infrastructure without depending on undocumented dashboard state.

## Important status

The product is pre-revenue unless later evidence is documented. Do not claim a complete real-store Trendyol production validation until the end-to-end test described in `KNOWN_LIMITATIONS.md` has actually been completed.

## Security

Never commit API secrets, seller credentials, personal access tokens or `.env` files. During a transfer, the buyer should create/rotate secrets in buyer-controlled infrastructure accounts.
