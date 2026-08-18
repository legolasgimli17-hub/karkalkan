# Security Architecture

## Trust boundaries

| Boundary | Authentication | Sensitive data rule |
| --- | --- | --- |
| Browser → Supabase Auth | Supabase access token | Passwords are sent only to Supabase Auth over TLS |
| Browser → authenticated Edge Function | Bearer token plus server-side `getUser` validation | Every tenant operation is owner-scoped |
| Marketplace → order callback | Per-connection hook key, stored as a hash | Body is bounded before parsing; writes are transactional |
| Paddle → billing callback | Timestamped HMAC signature | Raw payload is bounded and hashed for idempotency/conflict checks |
| Amazon → OAuth callback | One-use, expiring state bound to user, connection and expected seller | Refresh token is stored only in Vault |
| Edge Function → marketplace API | Vault credential or managed application secret | Redirects are rejected; timeouts and page limits are mandatory |
| Edge Function → Postgres | Transaction-mode pooler | Browser roles cannot use server-only tables or Vault |

## Tenant isolation

Application tables exposed through the public schema have Row Level Security enabled. Browser-readable records use owner checks based on `(select auth.uid()) = user_id`. Browser roles do not receive mutation grants for synchronized financial records. Server-side writes include owner and connection identifiers, with composite ownership constraints where applicable.

The `amazon_oauth_states`, `billing_events` and `edge_rate_limits` tables are server-only. Explicit deny policies document this boundary and prevent accidental browser access even though RLS is enabled.

## Credential handling

Marketplace API keys, secrets and Amazon refresh tokens are stored in Supabase Vault. Browser responses expose only configuration state, never decrypted values. Connection deletion removes connection-scoped Vault records in the same database transaction. Repository history and CI must remain free of production secrets.

## Request and provider controls

- JSON and webhook bodies are read through bounded streaming readers.
- Unsupported content types and malformed UTF-8/JSON are rejected.
- High-risk credential, import, OAuth and webhook paths use database-backed fixed-window limits keyed by SHA-256 hashes.
- Provider pagination, import record counts and webhook batch sizes are capped.
- Credentialed fetches reject redirects and enforce timeouts.
- Webhook comparison uses constant-time verification.

## Monitoring and error handling

Sentry receives stable function and error codes plus the original error type, not raw exception messages or request payloads. Public responses use stable error codes. Security probes must be removed or disabled after installation validation.

## Browser controls

Vercel applies a restrictive Content Security Policy, HSTS, frame denial, MIME sniffing protection, no-referrer policy, permission restrictions and cross-origin isolation headers. The application route is served with `no-store`.

## Deployment control

Production changes flow through branch, preview, automated verification and merge. CI actions are pinned to immutable revisions. CodeQL runs for pull requests, main and on a weekly schedule.
