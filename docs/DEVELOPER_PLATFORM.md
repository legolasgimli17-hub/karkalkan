# KârKalkan Developer Platform v1

KârKalkan exposes a buyer-transferable, read-only developer API and signed outbound webhooks. This layer is intentionally separate from marketplace credentials and browser sessions.

## Security model

- API keys use the `kk_live_` prefix and at least 256 bits of random material.
- Only a SHA-256 hash and short prefix are stored in PostgreSQL. The full key is returned once at creation.
- Browser roles have no direct privileges on developer-platform tables.
- API keys are scoped and revocable; default expiry is 90 days and the maximum is 365 days.
- Public API responses contain aggregate seller-finance/product data only; they do not expose marketplace credentials, raw customer data, seller API secrets, bank descriptions or auth identifiers.
- Webhook signing secrets use the `whsec_` prefix and are stored encrypted in Supabase Vault. They are returned once at creation.
- Webhook deliveries use HMAC-SHA256, HTTPS only, port 443, no redirects, an 8-second timeout and a single retry only for 5xx responses.
- Webhook delivery failure never rolls back or changes an authoritative finance/sync result.

## Function endpoints

All URLs below are relative to the buyer-owned Supabase project:

- `developer-api-keys` — authenticated management endpoint (`verify_jwt=true`)
- `developer-webhooks` — authenticated management/test endpoint (`verify_jwt=true`)
- `public-api-v1` — server-to-server API-key endpoint (`verify_jwt=false`; authenticates its own `kk_live_` bearer key)

The public API is intended for server-to-server use. Do **not** place a `kk_live_` key in browser JavaScript, a mobile bundle or a public repository.

## API-key scopes

| Scope | Resource |
| --- | --- |
| `connections:read` | connection IDs, marketplace, connection/sync status |
| `finance:read` | deterministic aggregate financial ledger fields |
| `products:read` | aggregate product finance/profitability fields |

### Create a key

Call `developer-api-keys` with the signed-in user's Supabase JWT:

```json
{
  "action": "create",
  "name": "ERP production",
  "scopes": ["connections:read", "finance:read"],
  "expires_in_days": 90
}
```

The response contains `secret` exactly once. Store it in the caller's server-side secret manager.

### Revoke a key

```json
{
  "action": "revoke",
  "id": "<developer-api-key-id>"
}
```

## Public API v1

Authenticate with:

```text
Authorization: Bearer kk_live_...
```

The endpoint is deliberately read-only.

### Connections

```text
GET /functions/v1/public-api-v1?resource=connections
```

Requires `connections:read`.

### Finance summary

```text
GET /functions/v1/public-api-v1?resource=finance&connection_id=<uuid>&days=30
```

Requires `finance:read`. `days` is restricted to `7`, `30` or `90`.

Returned fields are deterministic ledger aggregates such as gross sales, returns, commission, discounts, coupons, platform service fee, stoppage, cargo cost, seller revenue and transaction count. The API does not ask an LLM to calculate these values.

### Product summary

```text
GET /functions/v1/public-api-v1?resource=products&connection_id=<uuid>&days=30
```

Requires `products:read`. Results are capped at 100 products per request in v1.

## Outbound webhooks

Create webhooks through `developer-webhooks` using the signed-in user's Supabase JWT.

```json
{
  "action": "create",
  "endpoint_url": "https://example.com/karkalkan/webhooks",
  "event_types": ["webhook.test", "sync.completed", "sync.failed", "reconciliation.matched"]
}
```

The returned `signingSecret` is shown once. Store it server-side.

### Current events

| Event | Emitted when |
| --- | --- |
| `webhook.test` | user explicitly requests a test delivery |
| `sync.completed` | the full persisted Trendyol resumable job finishes all required core + auxiliary chunks |
| `sync.failed` | a Trendyol resumable chunk reaches a terminal failure after retry policy is exhausted |
| `reconciliation.matched` | a closed seven-day Trendyol aggregate reconciliation matches every required field to ±₺0.01 |

No event is emitted merely because a sync started, a retry is waiting, or reconciliation requires review.

### Signature

Each delivery includes:

```text
X-Karkalkan-Event: sync.completed
X-Karkalkan-Delivery: <event UUID>
X-Karkalkan-Timestamp: <unix seconds>
X-Karkalkan-Signature: v1=<hex HMAC-SHA256>
```

The signature input is:

```text
<timestamp>.<exact raw HTTP request body>
```

Verify the signature with the webhook's `whsec_...` signing secret using constant-time comparison. Reject stale timestamps according to the receiving system's replay policy.

The JSON body shape is:

```json
{
  "id": "<event UUID>",
  "type": "sync.completed",
  "created_at": "2026-08-22T00:00:00.000Z",
  "data": {}
}
```

## Delivery behavior

- `2xx` is success.
- `5xx` receives one short immediate retry.
- redirects are rejected.
- network/timeout/non-2xx failures are recorded using safe error codes; response bodies are not stored.
- a webhook failure is non-blocking and cannot change a successful finance calculation, reconciliation or marketplace sync into a failure.

## Transfer / buyer checklist

1. Rotate all buyer-owned Supabase/Vercel/GitHub secrets after transfer.
2. Set `KARKALKAN_APP_ORIGIN` to the buyer's canonical domain.
3. Leave `KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX` empty unless a buyer-controlled preview suffix genuinely needs production Edge access.
4. Generate fresh developer API keys after transfer; do not transfer old plaintext keys.
5. Create fresh webhook signing secrets after transfer if endpoint ownership changes.
6. Run a webhook test against a buyer-owned HTTPS endpoint and verify the signature using the exact raw body.
7. Do not claim customer/public-API adoption merely because the developer platform is implemented. Usage/traction must be evidenced separately.

## Known boundary

The developer platform is implemented as a product capability. Production currently has no documented third-party API client adoption or external webhook delivery evidence. A buyer should run the test flow after configuring its own infrastructure before representing this layer as externally validated.
