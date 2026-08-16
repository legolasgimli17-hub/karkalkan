# KârKalkan vNext Architecture

## Signal then reconcile

KârKalkan separates fast operational visibility from financial truth.

```text
Trendyol order callback
        |
        v
order-events -- x-api-key hash verification + retry dedupe
        |
        +--> marketplace_order_events (append-only signal history)
        +--> marketplace_live_orders  (latest package state)
        |
        v
live-overview --> seller-facing fast signal

Periodic reconciliation remains independent:
Trendyol settlement + Order V2 + accepted claims + Other Financials + cargo invoices
        |
        v
trendyol-sync / otherfinancials / cargo sync
        |
        v
marketplace_daily_financials + marketplace_product_daily_metrics
        |
        +--> dashboard-summary
        +--> risk-alerts
        +--> decision-center
```

A live event does not overwrite reconciled finance. It is deliberately a different evidence layer.

## Trust boundaries

- Browser-authenticated reads use the seller's Supabase JWT and RLS.
- `webhook-manager` requires a seller JWT and can manage only a connection visible through RLS.
- Trendyol callbacks cannot supply a Supabase JWT, so `order-events` uses a randomly generated per-connection callback key. Only its SHA-256 hash is persisted.
- Callback retries are deduplicated through `event_fingerprint`.
- Live order tables use composite connection/user ownership foreign keys and select-own RLS policies.
- Customer names, addresses and telephone numbers are not stored by the live-signal layer.

## Decision layer

`decision-center` computes an explainable score from measurable evidence coverage rather than an opaque model. Its radar distinguishes an affected basis from a proven financial loss.

This keeps the UI useful even when some evidence is incomplete without presenting uncertainty as certainty.
