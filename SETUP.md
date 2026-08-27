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

Before production ownership is transferred, complete the MFA, recovery-code and least-privilege checklist in `docs/CONTROL_PLANE_SECURITY.md`. These controls require the authorized human account owner; passwords, one-time codes and recovery codes must never be pasted into chat, source code or issues.

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
- `PADDLE_ENVIRONMENT` — `sandbox` during acceptance testing, then `production` after Paddle approves the seller account and domain.
- `PADDLE_API_KEY` — server-side Paddle Billing API key with transaction and customer-portal permissions.
- `PADDLE_WEBHOOK_SECRET` — secret for the Paddle notification destination that points to `/functions/v1/billing-webhook`.
- `PADDLE_CHECKOUT_URL` — Paddle-approved return/checkout domain, normally `https://karkalkan.vercel.app/uygulama#billing`.
- `PADDLE_PRICE_STARTER_MONTHLY`, `PADDLE_PRICE_GROWTH_MONTHLY`, `PADDLE_PRICE_SCALE_MONTHLY` — Paddle recurring price IDs. The catalog amounts in Paddle must match the visible pricing before production is enabled.
- `PADDLE_WEBHOOK_TOLERANCE_SECONDS` — accepted webhook timestamp skew, default `5`; values outside `5..120` fall back to `5`.
- `AMAZON_SPAPI_APPLICATION_ID` — Amazon public SP-API application ID used in Seller Central consent URLs.
- `AMAZON_LWA_CLIENT_ID` and `AMAZON_LWA_CLIENT_SECRET` — Login with Amazon credentials. Store only as Edge Function secrets.
- `AMAZON_SPAPI_REDIRECT_URI` — exact registered redirect URI; for this project it is `https://<project-ref>.supabase.co/functions/v1/amazon-auth-callback`.
- `AMAZON_SPAPI_APP_STAGE` — `draft` while using Amazon's beta authorization flow; set to `published` only after the application is approved/published.

Example shape:

```text
SUPABASE_PUBLISHABLE_KEYS={"default":"sb_publishable_REPLACE_ME"}
PADDLE_ENVIRONMENT=sandbox
PADDLE_PRICE_STARTER_MONTHLY=pri_REPLACE_ME
AMAZON_SPAPI_APPLICATION_ID=amzn1.sellerapps.app.REPLACE_ME
AMAZON_SPAPI_APP_STAGE=draft
```

The application never collects card numbers. `billing-checkout` creates a Paddle transaction and redirects to Paddle's hosted checkout. It remains closed unless the API key, webhook secret, HTTPS checkout URL and all three recurring price IDs are valid; this prevents charging a customer while entitlement provisioning is incomplete. `billing-webhook` verifies the exact raw request body using `Paddle-Signature`, enforces the short replay window, records an idempotency hash, and stores only safe subscription identifiers/state. Invoices, tax collection and payment-method changes stay in Paddle's hosted portal. Follow `docs/PADDLE_GO_LIVE.md` for the owner-only activation steps.

Supabase reserves the `SUPABASE_` prefix and supplies `SUPABASE_DB_URL` itself as a direct database URL, so application code must not use that default for Edge runtime SQL. The custom `KARKALKAN_DB_POOLER_URL` secret avoids the reserved prefix. The shared Postgres factory forces `prepare:false` because transaction pooling does not support prepared statements, and caps each Edge isolate at `max:1` client connection. A wrong/missing pooler URL produces `SERVER_CONFIG` instead of silently opening direct connections.

### Hepsiburada first-store activation

1. In the Hepsiburada merchant panel, open **Bilgilerim → Entegrasyon → Entegratör Bilgileri**.
2. Copy the merchant's UUID-shaped **Merchant ID**, integration username and the **Servis Anahtarı** created for the integrator. Do not send these values by chat or email.
3. In KârKalkan, add a Hepsiburada store, enter the Merchant ID, and save the two credential fields. They are written only to Supabase Vault.
4. Start with a 7-day sync. The worker reads the official `transactions/merchantid/{merchantId}` and finance-performance `orders/merchantid/{merchantId}` endpoints using Basic Auth and the required `User-Agent` header.
5. Compare payment, return, commission, service fee, cargo and stoppage totals against the same merchant-statement period. Only after this reconciliation should the provider be promoted from API beta to live-verified.
6. Rotate the service key immediately if it was exposed outside the merchant panel/KârKalkan credential form.

### n11 first-store activation

1. In n11 Seller Office, open **Hesabım → API Hesapları** and create or select an API account.
2. Copy the API key shown in the panel and the API password delivered through the authorized merchant email. Do not send these values by chat or ordinary email.
3. In KârKalkan, add an n11 store and save **API anahtarı** and **API şifresi**. They are written only to Supabase Vault.
4. Start with a 7-day sync. The worker reads the official `shipmentPackages` REST endpoint and the `ClaimReturnList` SOAP endpoint, discards cancelled lines and includes only approved/manual-refund claims.
5. Compare order totals, seller discounts, commission/service-rate calculations and approved returns with the same period in Seller Office.
6. n11's public order API does not expose every final cargo and account-statement adjustment. Import the n11 payment-detail report through KârKalkan's standard finance report path before treating the result as final cash reconciliation.
7. Rotate the API password immediately if it was exposed outside the merchant panel/KârKalkan credential form.

### Amazon Türkiye application activation

The code path is complete, but Amazon account creation, identity/business verification and production application registration must be completed by an authorized business account owner who meets Amazon's eligibility requirements.

1. In Amazon's Solution Provider Portal, register a public seller application for the Turkey store and request the **Finance and Accounting** role. KârKalkan's financial flow does not request customer PII or restricted operations.
2. Register `https://karkalkan.vercel.app/uygulama` as the website **Log-in URI**.
3. Register `https://<project-ref>.supabase.co/functions/v1/amazon-auth-callback` as the exact **Redirect URI**.
4. Save the assigned Application ID, LWA Client ID and LWA Client Secret only in Supabase Edge Function secrets using the names above. Keep `AMAZON_SPAPI_APP_STAGE=draft` during Amazon's beta test flow.
5. In KârKalkan, create/select an Amazon connection and choose **Amazon’a güvenli bağlan**. The app validates Amazon's callback host, creates a one-use state, exchanges the five-minute authorization code server-side and stores only the refresh token in Supabase Vault.
6. Start with a 7-day sync. The worker calls the Europe endpoint for Turkey marketplace `A33AVAJ2PDY3EV`, imports released Finances API v2024-06-19 transactions and keeps unknown breakdowns visible in safe synchronization metadata.
7. Compare the same period against Amazon settlement/transaction reports. Amazon states that financial events can lag by up to 48 hours, so do not compare a still-moving most-recent period as though it were final.
8. After Amazon approves/publishes the application and the end-to-end reconciliation passes, set `AMAZON_SPAPI_APP_STAGE=published` and repeat the acceptance test.

### FLO partner activation

FLO partner access is private and granted per merchant. KârKalkan does not guess undocumented provider endpoints or response fields.

1. Ask the FLO merchant/partner contact for the **Tedarikçi / mağaza ID**, **API kullanıcı adı**, **API şifresi**, current base URL, authentication scheme and the official finance/order response documentation for that merchant account.
2. Create the FLO connection with the assigned ID. Store the API username and password only in KârKalkan's credential form; they are written to Supabase Vault and do not mark the connection as automatically verified.
3. Until the official endpoint contract is supplied, export the merchant finance report and use KârKalkan's bounded standard-finance CSV path. This path is operational now and keeps the provider provenance as FLO.
4. Give the endpoint documentation—not the password—to the integration maintainer. Implement the automatic worker against that exact contract, then perform the closed-period reconciliation described in `KNOWN_LIMITATIONS.md` before changing the provider from approval-gated to live-verified.
5. Rotate the API password immediately if it was pasted into chat, email, an issue, source code or a committed environment file.

The exact owner/provider handoff and the required evidence are recorded in `docs/FLO_PARTNER_ACTIVATION.md`.

### Origin / CORS note for a buyer

Edge Functions derive the canonical application origin from `KARKALKAN_APP_ORIGIN` (defaulting to `https://karkalkan.vercel.app`). Preview access is disabled by default and is enabled only when the buyer sets `KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX` to a buyer-controlled HTTPS hostname suffix. No seller-specific Vercel team hostname should be hard-coded in source.

After transfer/redeploy, set these values to the buyer-owned production and preview origins before calling production Edge Functions from a new Vercel team/domain. Generated Vercel deployment aliases are platform metadata and should not be used as public application URLs.

This configuration avoids transferring a seller's personal Vercel account.

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
