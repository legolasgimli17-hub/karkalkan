# KârKalkan — Architecture Overview

## Product surfaces

- **Public KârKalkan experience** — explains the seller value proposition using example data.
- **Demo** — API-free example store experience.
- **Profitability calculator** — manual calculation path for sellers who do not want to connect a store yet.
- **Authenticated dashboard** — store connection, marketplace credential handling, sync, costs and profitability views.
- **Server-side integration layer** — Supabase functions/database logic for marketplace synchronization and financial data processing.
- **Health endpoint** — basic deployment health verification.

## Hosting and services

### Vercel

Hosts the public web application and `/api/health`. `vercel.json` defines clean routes and security headers.

### Supabase

Provides authentication, Postgres data storage, migrations, server-side functions and secret-management capabilities used by the marketplace integration.

### GitHub

Canonical source repository and change history. `main` is the production source branch. New work should be performed on feature branches and validated through preview deployments before merge.

## Data flow

High-level real-store flow:

1. User authenticates.
2. User creates a store connection.
3. Marketplace credentials are submitted to the server-side credential flow.
4. Server-side functions request marketplace data.
5. Normalized financial/sales data is stored per user/store.
6. User-provided product costs enrich marketplace data.
7. Dashboard calculations present sales, deductions and profitability outputs.

Public demo flow does not require marketplace credentials and uses example data.

## Security principles

- Never commit marketplace secrets or infrastructure tokens.
- Keep sensitive marketplace operations server-side.
- Preserve user/store isolation and RLS policies.
- Rotate credentials during acquisition handover.
- Keep CSP and other security headers in `vercel.json` unless a reviewed change requires modification.

## Version policy

There is one product: **KârKalkan**.

Historical filenames such as `v4.html`, `v4.js` and migration filenames containing `v4` describe an implementation generation. They must not be interpreted as separate applications. Database migrations are historical records and should generally remain immutable. Public-facing links and copy should avoid version-number branding.
