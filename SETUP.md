# KârKalkan — Setup & Deployment

## Architecture

KârKalkan is a web application deployed on Vercel with Supabase providing authentication/database capabilities and server-side integration functions. The repository also contains the public demo and profitability tools.

## Buyer-owned accounts

For a clean acquisition handover, use buyer-controlled accounts for:

- GitHub
- Vercel
- Supabase
- Domain registrar, if a custom domain is transferred
- Advertising/analytics accounts, if separately agreed

Do not reuse the seller's personal tokens.

## Repository deployment

1. Import the repository into Vercel.
2. Keep the repository root as the project root unless the architecture is intentionally changed.
3. Vercel reads `vercel.json` for routes and security headers.
4. Configure the buyer's Supabase project values required by the frontend/server code.
5. Deploy a preview first.
6. Verify the preview.
7. Promote/merge once, then create the production deployment.

### Deployment discipline

Do not push every tiny edit directly to production. Use:

`feature branch -> preview deployment -> verification -> merge to main -> production`

Vercel keeps immutable historical deployments. These are deployment history, not separate copies of the product. The stable production alias should be the URL used in ads, documentation and customer links.

## Supabase

1. Create a buyer-owned Supabase project.
2. Apply SQL migrations in `supabase/migrations` in filename order.
3. Deploy the repository's required Edge Functions.
4. Configure server-side secrets using Supabase/Vercel secret management. Never commit secrets.
5. Verify authentication and Row Level Security behavior before accepting production traffic.

## Smoke test

Verify at minimum:

- `/` returns the current public KârKalkan experience
- `/demo` loads without authentication
- `/hesapla` loads without authentication
- `/api/health` returns a healthy response
- account creation/sign-in works
- authenticated dashboard loads
- a store connection can be created
- credential handling does not expose secrets in browser storage/logs
- sync errors are handled without leaking secrets
- security headers remain active

## Production URL policy

Use one stable public URL in marketing and advertising. Do not advertise Vercel's generated deployment-specific URLs. Generated deployment URLs are immutable build records and may show separate per-deployment traffic in Vercel dashboards.

## Trendyol validation

Before advertising the integration as production-tested, perform and record the end-to-end validation described in `KNOWN_LIMITATIONS.md`.
