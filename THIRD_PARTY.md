# KârKalkan — Third-Party Runtime Inventory

This file records the runtime dependencies that should be reviewed during acquisition due diligence and future upgrades.

## Browser

- `@supabase/supabase-js` — pinned to `2.57.4` in `v4.html`, currently delivered through `cdn.jsdelivr.net`.
- Vercel Web Analytics client — served from the project's `/_vercel/insights/script.js` route.

## Supabase Edge Functions

The checked-in Edge Functions use version-pinned npm imports where applicable, including:

- `@supabase/supabase-js@2.57.4`
- `postgres@3.4.7`

Individual function source files are the source of truth for their imports.

## Upgrade policy

Before upgrading a third-party runtime dependency:

1. Review upstream release notes and license terms.
2. Test authentication, database access and marketplace sync in a preview/test environment.
3. If a browser script origin or delivery method changes, update and re-test Content Security Policy.
4. Keep dependency versions pinned rather than relying on an unbounded major-version URL.

This inventory is not a substitute for the upstream license files or terms. A buyer should perform their own dependency/license review as part of due diligence.
