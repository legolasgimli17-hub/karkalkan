# KârKalkan — Trendyol Real-Store Validation Protocol

Last reviewed: 2026-08-19

Status: **not yet production-validated with a real seller store**.

This runbook defines the evidence required before KârKalkan may describe the Trendyol integration as real-store validated. It is deliberately stricter than “the API returned 200”. Credentials, seller IDs, order IDs, customer data and raw marketplace reports must never be committed to this public repository.

## Why the sync has two required stages

Trendyol's current domestic current-account documentation states that `settlements` and `otherfinancials` return separate financial records. KârKalkan therefore treats a Trendyol sync as complete only after both product stages succeed:

1. `trendyol-sync`
   - `settlements`: Sale, Return, PayByLink and supported settlement adjustments;
   - Order V2 enrichment for quantities/product metadata;
   - accepted-claim enrichment for return quantities;
   - writes the core daily finance and product-profit evidence rows.
2. `trendyol-otherfinancials-sync`
   - `otherfinancials`: Platform Service Fee and Stoppage;
   - DeductionInvoices discovery for cargo invoices;
   - cargo-invoice item retrieval;
   - order-to-product mapping and cargo allocation where evidence permits it.

The authenticated workspace's Trendyol sync button must invoke these two stages sequentially. A 200 response from the core stage alone is **not** sufficient for a “complete Trendyol sync” claim.

The standalone `trendyol-cargo-sync` worker remains a deployed historical/specialized worker. The current complete workspace pipeline uses `trendyol-otherfinancials-sync`, which already retrieves cargo invoice items and writes cargo totals/allocations alongside the other-financial fields. Do not invoke both in the normal pipeline and double-maintain the same cargo window.

## Prerequisites

Before starting the validation:

- use a real Trendyol seller account controlled by the tester/merchant;
- create the store through `/uygulama` and save the API key/secret only through KârKalkan's credential/Vault flow;
- never paste credentials into issues, PRs, screenshots, chat transcripts or this document;
- confirm the selected store shows a successful credential state;
- use the production KârKalkan deployment and production Supabase project;
- ensure no marketplace sync is already holding the store lock;
- keep the seller's source report/export available privately for comparison.

## Validation window

Run a 30-day sync, then reconcile one **closed seven-day slice** contained inside that imported window. Prefer a seven-day slice that ends at least three calendar days before the validation date so same-day posting/return timing does not dominate the comparison.

The sync workers operate on Istanbul-local day boundaries. Record the exact seven calendar dates used for the comparison. Do not compare one report's order-created date to another report's financial-posting date without documenting that difference.

## Step 1 — Run the product flow

From `/uygulama`:

1. select the real Trendyol connection;
2. select 30 days;
3. click **Trendyol'u eşitle** once;
4. require the core stage to finish successfully;
5. require the other-financial/cargo stage to finish successfully;
6. if `cargoOk !== true` or `orderMapOk !== true`, treat the run as **partial**, not validated;
7. confirm the connection ends with `last_sync_status = success` for the core run and that the workspace loads without a silent truncation error.

Any `SYNC_TOO_LARGE`, page/window guard, rate-limit, authentication error, partial sync status or unclassified financial warning must be resolved or explicitly explained before sign-off.

## Step 2 — Capture private source evidence

For exactly the same seven-day slice, capture the seller's Trendyol financial/current-account evidence privately. At minimum the comparison must cover:

- sales / Sale and PayByLink effects where present;
- returns;
- commission;
- discounts and coupons;
- provision/manual refund/platform promotion/correction adjustments when present;
- delivery-fee settlement adjustments when present;
- Platform Service Fee;
- Stoppage;
- cargo invoice totals and cargo invoice item detail.

The public repository may record only sanitized aggregate totals and pass/fail evidence. Do not publish raw orders, customer data, API responses or credentials.

## Step 3 — Compare KârKalkan finance rows

For the chosen seven-day slice, aggregate `marketplace_daily_financials` for only the selected connection and compare the following KârKalkan fields with the source evidence:

| KârKalkan field | Evidence expectation |
| --- | --- |
| `gross_sales` | Trendyol sale/PayByLink financial records for the same posting window |
| `gross_returns` | Trendyol return financial records |
| `commission_cost` | commission effect after supported corrections/cancellations |
| `discount_cost`, `coupon_cost` | supported seller discount/coupon adjustments |
| `provision_net`, `manual_refund_net`, `platform_promo_net`, `delivery_fee_net`, `correction_net` | matching settlement adjustment types when present |
| `platform_service_fee_cost` | Other Financials → DeductionInvoices / PlatformServiceFee |
| `stoppage_net` | Other Financials → Stoppage |
| `cargo_cost` | sum of the applicable Trendyol cargo invoice items |
| `seller_revenue` / known-cash fields | reconcile only after all applicable components above are accounted for |

A total must not be declared “wrong” merely because one system groups the same posting under a different calendar day. First classify posting-date/time-zone differences and compare the closed period totals.

## Step 4 — Validate product and quantity evidence

For `marketplace_product_daily_metrics` in the same slice:

- inspect `sales_unit_basis`, `return_unit_basis` and `unit_basis`;
- prefer rows backed by `order_v2_quantity` for sales quantities;
- check accepted-claim evidence for return quantities where available;
- record the count/amount of any settlement-proxy or mixed-fallback rows;
- verify product names/SKUs/barcodes are enrichment, not substitutes for finance-source amounts;
- do not treat product-cost coverage as a marketplace-finance discrepancy. Seller-entered COGS is a separate validation dimension.

## Step 5 — Validate cargo evidence

Require:

- `cargoOk = true`;
- `orderMapOk = true` for the normal “complete” sign-off;
- cargo invoice totals in `marketplace_daily_financials.cargo_cost` to reconcile to the relevant cargo invoice items;
- `allocatedCargoCost + unallocatedCargoCost` to reconcile to the cargo total within currency rounding;
- any unmatched cargo item to remain visible as unmatched rather than being silently assigned to a product.

Product-level cargo allocation is explanatory attribution. The invoice total is the authoritative amount for the KârKalkan finance total.

## Discrepancy classification

Every non-zero unexplained delta must be placed in one of these buckets before sign-off:

1. date/time-zone or posting-date boundary;
2. return/claim status timing;
3. late fee/invoice posting;
4. supported adjustment classification difference;
5. unclassified Trendyol transaction type;
6. missing/partial pagination or worker safety ceiling;
7. order-to-product enrichment mismatch that does not change the source finance total;
8. actual calculation/mapping defect.

Category 8 blocks validation and requires a code fix plus a fresh reconciliation. Categories 1–7 require written evidence that the total is understood and no financial row was silently omitted.

## Pass criteria

Trendyol may be marked real-store validated only when all are true:

- real seller credentials were used through the Vault path;
- both required sync stages completed without a safety ceiling or silent partial result;
- the closed seven-day source window and KârKalkan window are identical and documented;
- sales, returns, commission, applicable settlement adjustments, Platform Service Fee, Stoppage and cargo are reconciled;
- no unexplained material financial delta remains;
- any fallback/proxy quantity evidence is recorded rather than presented as exact;
- product-cost/profit output is checked only after the marketplace-finance reconciliation passes;
- a sanitized validation record is saved without seller/customer secrets or PII.

Do **not** define a universal percentage tolerance in advance. A small percentage can still hide a systematic fee mapping defect. Each residual amount must be explained; unavoidable currency rounding may be recorded explicitly.

## Sanitized validation record

After a successful run, add a private validation artifact and record only this non-sensitive summary in the repository or release notes:

- validation date;
- seven-day comparison window;
- worker versions / relevant deployment commit;
- core sync status;
- auxiliary finance/cargo status;
- aggregate source totals vs KârKalkan totals by category;
- residual explained rounding amount, if any;
- count of unclassified transaction types;
- count of fallback/mixed quantity rows;
- reviewer/sign-off result.

Only after this record exists should `KNOWN_LIMITATIONS.md` be changed from “production validation — outstanding” to a dated, evidence-backed validation statement.

## Current official references

- Trendyol Developers — Domestic Current Account Statement Integration: `https://developers.trendyol.com/tr/docs/cari-hesap-ekstresi-entegrasyonu`
- Trendyol Developers — Settlements: `https://developers.trendyol.com/reference/getsettlements`
- Trendyol Developers — Other Financials: `https://developers.trendyol.com/reference/getotherfinancials`
- Trendyol Developers — Cargo Invoice Items: `https://developers.trendyol.com/reference/getcargoinvoiceitems`
- Trendyol Developers — Order V2 / Shipment Packages: `https://developers.trendyol.com/v2.0/docs/get-order-packages-getshipmentpackages`

Re-check these official pages at each future validation because marketplace APIs and transaction semantics can change.
