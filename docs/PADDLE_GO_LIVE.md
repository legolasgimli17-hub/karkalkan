# Paddle Billing Go-Live Runbook

Last reviewed: 2026-08-18

This runbook separates completed application work from actions that only the authorized account owner can perform. KârKalkan uses Paddle-hosted checkout and customer portal pages; it does not collect or store card data.

## Implemented and fail-closed

- Recurring plans are defined as Başlangıç `499 TRY/month`, Büyüme `899 TRY/month` and Ölçek `2499 TRY/month`, before applicable tax.
- Checkout requires an authenticated KârKalkan user and rejects an account that already has an active, trialing, past-due or paused subscription.
- Transaction custom data binds the checkout to the authenticated user, requested plan and KârKalkan product.
- Incoming webhooks are verified from the exact raw request body with `Paddle-Signature`, constant-time comparison and a five-second default timestamp window.
- Event IDs are idempotent and also bound to a SHA-256 payload hash; a reused event ID with different content is rejected.
- The configured Paddle price ID—not customer-controlled metadata—is authoritative for plan assignment.
- Checkout stays disabled until the API key, notification secret, HTTPS checkout URL and all three structurally valid recurring price IDs are configured.

## Account-owner actions

1. Create the Paddle account using the legal business owner's real details and complete identity/business verification.
2. Submit `https://karkalkan.vercel.app` for domain approval.
3. In the sandbox catalog, create one recurring monthly product/price for each visible plan and confirm the amounts above.
4. Create a notification destination pointing to:

   `https://ilybqwjhkxfzociyvpeg.supabase.co/functions/v1/billing-webhook`

5. Subscribe the destination to subscription lifecycle events needed to create, update, pause, resume and cancel subscription state.
6. Copy the sandbox API key, destination secret and the three `pri_...` IDs into Supabase Edge Function secrets using `.env.example` as the exact name list. Never send their values by chat or commit them.
7. After Paddle approves the live account and domain, recreate/confirm the products and prices in the live catalog. Sandbox IDs and keys cannot be reused in live mode.
8. Replace all Paddle secrets with live values in one change, set `PADDLE_ENVIRONMENT=production`, keep `PADDLE_WEBHOOK_TOLERANCE_SECONDS=5`, and redeploy the four billing functions.
9. Add payout details in the Paddle account. This is a financial account-owner action and must not be delegated through source code or chat.

## Required secrets

- `PADDLE_ENVIRONMENT`
- `PADDLE_API_KEY`
- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_CHECKOUT_URL`
- `PADDLE_PRICE_STARTER_MONTHLY`
- `PADDLE_PRICE_GROWTH_MONTHLY`
- `PADDLE_PRICE_SCALE_MONTHLY`
- `PADDLE_WEBHOOK_TOLERANCE_SECONDS`

## Official references

- Paddle setup checklist: <https://developer.paddle.com/build/set-up-checklist>
- Paddle go-live checklist: <https://developer.paddle.com/build/go-live-checklist>
- Webhook signature verification: <https://developer.paddle.com/webhooks/about/signature-verification>

Do not claim live billing until Paddle approval and the excluded payment acceptance tests are completed.
