# Security Review — 2026-08-18

## Scope

Static frontend, Vercel headers/routes, version-controlled Supabase schema, all Edge Function sources, marketplace OAuth/credential/sync flows, callbacks, billing boundaries, CI and repository hygiene.

## Remediated in this review

- added streaming request-size and media-type enforcement across every request body;
- added hashed database-backed limits to sensitive OAuth, credential, import and callback paths;
- made order-event writes transactional and bounded event/package/line counts;
- bound Amazon OAuth state to the expected seller and rejected credentialed redirects;
- prevented connection deletion from leaving connection-scoped Vault secrets;
- prevented billing custom data from escalating a plan and detected event-ID payload conflicts;
- removed raw exception details from external monitoring and selected logs;
- added missing OAuth-state user index and explicit server-only RLS policies;
- strengthened production browser headers and removed account-existence wording;
- added immutable CI dependencies, CodeQL, dependency updates, ownership and review templates.

## Verified controls

- all application tables in the exposed schema have RLS enabled;
- browser roles have no anonymous table access and only owner-scoped authenticated reads where intended;
- Vault helper execution is not available to browser roles;
- no production secrets were found in the checked-out source snapshot;
- Edge Function TypeScript parses as a complete bundle;
- repository finance, ownership, callback and visual-integrity tests pass.

## Residual work outside code

- enable Supabase breached-password protection when plan support is available;
- require MFA/least privilege in GitHub, Supabase, Vercel, Sentry and Paddle;
- configure WAF/rate limits at the edge before high-volume launch;
- verify provider integrations with buyer-owned approved accounts and real test stores;
- complete independent penetration testing and a backup-restore exercise.

These items are deployment and assurance gates. They must not be represented as complete until evidence is recorded.
