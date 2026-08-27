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

The production project should be named **`karkalkan`** or another buyer-controlled equivalent. Buyer deployments must not depend on a seller-specific Vercel project/team identifier. Duplicate or test projects should not remain connected to the same production branch because they create redundant builds and can consume deployment quotas without adding a separate production surface.

### Supabase

Provides authentication, Postgres data storage, migrations, server-side functions and secret-management capabilities used by the marketplace integration. The buyer can recreate the backend in a buyer-owned Supabase project from the version-controlled migrations, Edge Function sources and `supabase/config.toml` auth settings.

### GitHub

Canonical source repository and change history during development. `main` is the production source branch. New work should be performed on feature branches and validated through preview deployments before merge. For an identity-private acquisition, the buyer may instead create a fresh buyer-owned repository from the history-free source bundle rather than inheriting seller Git metadata.

## Data flow

High-level real-store flow:

1. User authenticates.
2. User creates a store connection.
3. Marketplace credentials are submitted to the server-side credential flow.
4. Server-side functions request marketplace data.
5. Normalized financial/sales data is stored per user/store.
6. User-provided product costs enrich marketplace data.
7. Shared finance primitives convert those rows into one cash vocabulary.
8. Dashboard, alert, confidence and portfolio endpoints build their own views from that same finance core.

Public demo flow does not require marketplace credentials and uses example data.

## Shared finance core

`supabase/functions/_shared/finance.js` is the single reusable source for seller-facing financial primitives. It owns:

- paginated reads with an explicit maximum-row failure instead of silent truncation,
- settlement-adjusted seller cash,
- platform/kargo deductions,
- stoppage-aware known cash,
- sales-weighted product-cost coverage,
- the rule that incomplete product cost cannot become a numeric operating contribution,
- operating-expense date overlap allocation.

`dashboard-summary`, `risk-alerts`, `decision-center` and `portfolio-summary` import this module. CI imports the same file directly, so production formulas and tests do not maintain separate copies of the core arithmetic.

## Authenticated dashboard layering

The historical authenticated core remains `v4.js` + `v4-enhance.js` + `v4-alerts.js`. The newer seller experience is now one behavior layer:

- `vnext.js` owns evidence confidence, daily cash visualization, money-leak radar, live order signals, operating expenses and portfolio refreshes.
- `vnext-ops.js` no longer exists; its behavior is consolidated into `vnext.js`.
- `v4-alerts.js` loads one vNext behavior script and the required styles.
- `refreshConnectionData` is wrapped once by the consolidated vNext layer instead of once per vNext feature file.

This keeps the historical core stable while reducing the number of interdependent browser-script wrappers.

## Test fixture

`tests/fixtures/synthetic-store.mjs` generates a deterministic 30-day synthetic seller dataset. It contains no real seller information. Finance tests use it to exercise stoppage, partial product-cost coverage, operating expenses and shared cash calculations with production code.

## Security principles

- Never commit marketplace secrets or infrastructure tokens.
- Keep sensitive marketplace operations server-side.
- Preserve user/store isolation and RLS policies.
- Rotate credentials during acquisition handover.
- Keep CSP and other security headers in `vercel.json` unless a reviewed change requires modification.
- Keep buyer handoff source independent of seller account/team/project identifiers.

## Version policy

There is one product: **KârKalkan**.

Historical filenames such as `v4.html`, `v4.js` and migration filenames containing `v4` describe an implementation generation. They must not be interpreted as separate applications. Database migrations are historical records and should generally remain immutable. Public-facing links and copy should avoid version-number branding.
