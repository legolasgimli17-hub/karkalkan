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
4. Configure the buyer's Supabase project values described below.
5. Deploy a preview first.
6. Verify the preview.
7. Promote/merge once, then create the production deployment.

### Deployment discipline

Do not push every tiny edit directly to production. Use:

`feature branch -> preview deployment -> verification -> merge to main -> production`

Vercel keeps immutable historical deployments. These are deployment history, not separate copies of the product. The stable production alias should be the URL used in ads, documentation and customer links.

## Frontend Supabase configuration

`v4.js` contains two public frontend values near the top of the file:

- `SUPABASE_URL`
- `PUBLISHABLE_KEY`

The publishable key is designed for browser use and is not a server secret, but a buyer deploying into a new Supabase project must replace both values with values from the buyer-owned project. Do **not** place service-role keys, database passwords or marketplace secrets in frontend JavaScript.

The browser Supabase client is pinned in `v4.html` to `@supabase/supabase-js@2.57.4`. If that version is changed, review the application and CSP before deployment.

## Supabase backend

1. Create a buyer-owned Supabase project.
2. Apply SQL migrations in `supabase/migrations` in filename order.
3. Deploy all functions under `supabase/functions`.
4. Preserve the per-function JWT settings in `supabase/config.toml`.
5. Configure required server-side secrets. Use `.env.example` only as a name/shape reference; never commit real values.
6. Verify authentication, Row Level Security and Vault access before accepting production traffic.

### Server-side configuration used by the Edge Functions

- `SUPABASE_URL` — supplied by the Supabase runtime.
- `KARKALKAN_DB_POOLER_URL` — custom **transaction-mode pooler** connection string used by functions that need Postgres/Vault access. It must use port `6543`; direct `db.<project-ref>.supabase.co:5432` URLs are rejected at runtime. Copy the Transaction pooler value from Supabase Dashboard → Connect. Treat it as a secret.
- `SUPABASE_PUBLISHABLE_KEYS` — JSON object containing the browser-safe/publishable key used by the server functions when creating user-scoped Supabase clients. The current code expects a `default` property.
- `SENTRY_DSN` — optional until a Sentry project is created; when present, critical Edge Functions report safe failure codes and unhandled exceptions. Request bodies, marketplace credentials and default PII are not sent.
- `SENTRY_ENVIRONMENT` — optional environment label; defaults to `production`.

Example shape:

```text
SUPABASE_PUBLISHABLE_KEYS={"default":"sb_publishable_REPLACE_ME"}
```

Supabase reserves the `SUPABASE_` prefix and supplies `SUPABASE_DB_URL` itself as a direct database URL, so application code must not use that default for Edge runtime SQL. The custom `KARKALKAN_DB_POOLER_URL` secret avoids the reserved prefix. The shared Postgres factory forces `prepare:false` because transaction pooling does not support prepared statements, and caps each Edge isolate at `max:1` client connection. A wrong/missing pooler URL produces `SERVER_CONFIG` instead of silently opening direct connections.

### Origin / CORS note for a buyer

The checked-in marketplace functions trust the canonical production origin `https://karkalkan.vercel.app` and the current Vercel preview hostname pattern. If the buyer changes the public domain or Vercel team, update the `allowedOrigin` rules in the relevant Edge Functions before using the new origin. Keeping the transferred canonical production domain avoids changing the production-origin entry, but buyer preview URLs may still require updating the preview-host rule.

This is configuration, not a reason to transfer the seller's personal Vercel account.

## Smoke test

Verify at minimum:

- `/` returns the current public KârKalkan experience
- `/demo` loads without authentication
- `/hesapla` loads without authentication
- `/uygulama` loads the single canonical store panel
- `/api/health` returns a healthy response
- account creation/sign-in works
- authenticated dashboard loads
- a store connection can be created
- credential handling does not expose secrets in browser storage/logs
- sync errors are handled without leaking secrets
- security headers remain active
- the Supabase browser bundle is not blocked by CSP

## Production URL policy

Use one stable public URL in marketing and advertising. Do not advertise Vercel's generated deployment-specific URLs. Generated deployment URLs are immutable build records and may show separate per-deployment traffic in Vercel dashboards.

Public application route: `/uygulama`. The historical source filename `v4.html` is an implementation detail and is redirected/canonicalized by Vercel routing.

## Trendyol validation

Before advertising the integration as production-tested, perform and record the end-to-end validation described in `KNOWN_LIMITATIONS.md`.
