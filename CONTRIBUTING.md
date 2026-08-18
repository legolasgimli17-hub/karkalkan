# Contributing

KârKalkan is a financial SaaS product. Changes must preserve tenant isolation, financial semantics and reproducibility.

## Workflow

1. Create a narrowly scoped branch from `main`.
2. Never add real credentials, personal data or production exports.
3. Add or update tests for behavior changes.
4. Run `node --test tests/*.test.mjs` and syntax checks before opening a pull request.
5. Use the pull-request template and document migrations, new secrets and rollback behavior.
6. Merge only after required checks and preview verification pass.

## Backend rules

- Validate authentication before tenant-owned reads or writes.
- Bind every data mutation to both `user_id` and `connection_id` where applicable.
- Use `KARKALKAN_DB_POOLER_URL` through the shared transaction-pool helper.
- Use bounded request readers for every body and bounded pagination for every provider API.
- Keep marketplace credentials in Vault; never return decrypted credentials to browser code.
- Reject redirects on credentialed third-party requests.
- Use timing-safe verification for webhook signatures and secrets.
- Return stable public error codes; send only sanitized failures to monitoring.
- Add migrations for schema changes and verify RLS/grants with Supabase advisors.

## Frontend rules

- Do not introduce inline scripts or unreviewed third-party resources; the Content Security Policy is intentionally restrictive.
- Never insert untrusted values with `innerHTML` unless they pass the existing escaping boundary.
- Keep financial unknowns explicit. Do not present estimated or incomplete values as accounting net profit.

## Dependency policy

Runtime imports must be version-pinned. GitHub Actions must be pinned to immutable commit SHAs. Dependabot proposals still require review and passing checks.
