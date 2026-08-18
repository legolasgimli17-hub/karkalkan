# Threat Model

Last reviewed: 2026-08-18

## Protected assets

- seller marketplace credentials and OAuth refresh tokens;
- tenant financial records and product costs;
- authenticated sessions and billing entitlement;
- calculation integrity and synchronization availability;
- deployment, Supabase and monitoring control planes.

## Primary threats and controls

| Threat | Main controls | Residual risk / owner action |
| --- | --- | --- |
| Cross-tenant data access | RLS, owner-scoped queries, composite ownership constraints, browser mutation revokes | Re-run RLS tests/advisors after every schema change |
| Credential disclosure | Vault, server-only reads, sanitized monitoring, secret scanning policy | Rotate immediately if a control-plane account or history is exposed |
| Forged callbacks | Timing-safe hook/HMAC checks, one-use OAuth state, seller binding, replay/idempotency records | Rotate webhook keys after suspected exposure |
| Resource exhaustion | Body/batch/page limits, timeouts, sync locks, database-backed rate limits | Add an upstream WAF/rate-limit layer before high-volume public launch |
| SSRF or credential forwarding | Fixed provider origins and `redirect: 'error'` | Review every new provider URL construction |
| Billing entitlement escalation | Server-side price-to-plan mapping; webhook payload conflict detection | Billing remains unavailable until buyer-owned Paddle configuration is validated |
| XSS/session theft | Strict CSP, no third-party scripts, escaping boundaries, short-lived session storage | Static browser architecture cannot provide HttpOnly session cookies; a BFF migration is recommended before enterprise claims |
| Dependency or CI compromise | Pinned runtime versions, immutable Action SHAs, CodeQL, Dependabot | Review upgrades; no automated production merge |
| Database connection exhaustion | Transaction-mode Supabase pooler and short pool lifetime | Monitor pool saturation under representative load |
| Operational account takeover | Managed provider controls | Enable MFA and least-privilege access on GitHub, Supabase, Vercel, Sentry and billing accounts |

## Explicit non-goals

This document is not a claim that exploitation is impossible. DDoS absorption, provider-account security, endpoint malware, compromised seller devices and malicious insiders require controls outside this repository.

## Review gates

Before a public paid launch:

1. Complete real sandbox/store validation for each advertised marketplace.
2. Enable breached-password protection in Supabase if the selected plan supports it.
3. Enable MFA on every production control-plane account and restrict membership.
4. Add an upstream WAF/rate-limit policy and verify backup restoration.
5. Commission an independent penetration test and remediate findings by severity.
