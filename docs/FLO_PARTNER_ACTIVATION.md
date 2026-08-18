# FLO Partner Activation Runbook

Last reviewed: 2026-08-18

## Current operational state

KârKalkan supports FLO through the bounded normalized finance-report importer. It also accepts the FLO-assigned supplier/store ID, API username and API password into Supabase Vault so the merchant does not need to recreate the connection when partner API access is documented.

Saving credentials does **not** mark FLO as connected or verified. The connection remains approval-gated until an automatic worker has used an official merchant-specific contract and completed financial reconciliation.

## Request from FLO or the merchant's integration contact

Request these items through the merchant's authorized channel:

- supplier/store ID;
- API username;
- API password;
- production base URL and current API version;
- authentication and required-header rules;
- order, return, cancellation, commission, service-fee, cargo, promotion and settlement schemas;
- pagination, rate-limit, retry and date-window rules;
- a non-sensitive sample response or formal field dictionary;
- credential rotation and incident contact procedure.

Do not request or paste the password in GitHub, an issue, email or chat. Enter it only in KârKalkan's authenticated credential form.

## Working report path

1. Create the FLO connection with the assigned supplier/store ID.
2. Download the standard KârKalkan finance CSV template from the provider panel.
3. Export a closed-period FLO merchant finance report and map its documented values to the template without manufacturing missing deductions.
4. Import at most 5,000 rows per file. The server validates tenant ownership, size, dates and financial fields before replacing only the supplied period.
5. Keep missing cost or deduction fields unknown; do not convert unknown values to zero.

## Automatic-worker acceptance gate

An automatic FLO worker may be enabled only after the official contract is available. It must use Vault credentials server-side, exclude customer PII, preserve provider transaction identifiers, classify only documented fields, surface unknown adjustments, use bounded pagination/retries and reconcile a closed statement period. Until then, the UI and documentation must continue to say **Onay gerekli** / **Rapor** rather than automatic or verified.
