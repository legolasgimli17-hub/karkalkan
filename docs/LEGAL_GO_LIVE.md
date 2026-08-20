# KârKalkan — Legal Go-Live Gate

Last reviewed: 2026-08-21

This checklist intentionally prevents the repository from claiming legal readiness merely because legal-looking pages exist. The public legal pages are preparation drafts until every blocking item below is completed with the real operator and actual production data flows.

## Blocking before commercial launch

1. **Identify the data controller / contracting party**
   - Fill the real-person or legal-entity name/title in `kvkk.html`, `gizlilik.html` and `kullanim-kosullari.html`.
   - Add a serviceable postal/KEP/e-mail channel for data-subject applications and contractual notices.
   - Do not use only the KârKalkan product name where the law requires the controller/contracting party identity.

2. **Approve the KVKK processing inventory**
   - For every data category, confirm the exact purpose, collection method, recipient group and KVKK Article 5 legal basis.
   - Confirm retention/deletion periods instead of leaving them criteria-only.
   - Confirm whether the operator has any VERBIS registration obligation or exemption; document the decision and evidence.
   - Reconcile the checked-in AI disclosure with the actual production model/provider configuration and the fields really transmitted.

3. **Map and legalize international transfers**
   - Build an actual recipient/country map for Supabase, Vercel, Paddle (when enabled), Sentry (when enabled), HIBP, marketplace integrations and the AI model provider (when enabled).
   - For every personal-data transfer abroad, identify the current Article 9 transfer mechanism.
   - If a KVKK standard contract is used, execute the correct controller/processor variant and complete the required Authority notification within the statutory deadline.
   - Store signed transfer documents outside the public repository.

4. **Processor/vendor review**
   - Record the actual production account entity and region for each vendor.
   - Review and retain the applicable DPA/privacy/terms documents.
   - Confirm subprocessors and any optional telemetry features.

5. **AI provider activation review**
   - Do not treat the presence of `OPENAI_API_KEY` as legal approval to enable AI commercially.
   - Review the current provider terms, data-processing terms/DPA, retention controls, subprocessors, data locations and security documentation for the actual account/product configuration.
   - Confirm that the production payload remains limited to the short user question plus the documented aggregate evidence pack; re-test that raw orders, customer records, bank descriptions, marketplace credentials, OAuth tokens and service-role secrets are excluded.
   - Confirm the applicable KVKK Article 5 legal basis for the real use case and the Article 9 mechanism for any international transfer.
   - Confirm whether any user-facing consent is actually required for a specific optional processing purpose; do not use consent merely as a substitute for the disclosure obligation.
   - Keep the product fail-closed: model failure/invalid evidence citations must fall back to deterministic analysis, and no irreversible financial action may be exposed to the model without a separate permissions/audit design.

6. **Account lifecycle**
   - Provide a reliable process for access/correction/deletion/account-closure requests.
   - Define what is deleted immediately, what is retained for a legal obligation, and who can execute the request.
   - Keep evidence that the disclosure was made at the time data was collected; do not require “consent to the disclosure”.

7. **Billing and consumer/commercial terms**
   - Before Paddle checkout is enabled, confirm seller identity, tax/invoice details, recurring billing wording, cancellation/refund rules and any consumer-law obligations for the target customer type.
   - Replace the governing-law/competent-authority placeholder in `kullanim-kosullari.html` with terms reviewed for the actual operator and customer geography.

8. **Cookie/analytics re-check**
   - Current Vercel Web Analytics is documented as cookie-free and anonymous/aggregate by design.
   - KârKalkan's Supabase onboarding analytics stores aggregate counters only.
   - The evidence-bound AI feature does not require a browser cookie merely because a model API is used.
   - If advertising, replay, heatmap, behavioral profiling or another non-essential tracking technology is added, re-run the consent/cookie assessment before deployment.

## Current technical privacy controls reflected in the drafts

- Marketplace secrets are handled server-side and stored through the existing Vault flow.
- Browser code does not intentionally persist marketplace secrets.
- Bank reconciliation minimizes imported descriptions, avoids full IBAN/account storage and fingerprints raw references.
- Paddle-hosted billing keeps card details out of KârKalkan application storage.
- HIBP Pwned Passwords uses the k-anonymity range approach; plaintext passwords/full hashes are not sent.
- Sentry integration is optional and configured with `sendDefaultPii:false`, no tracing sample, and sanitized error codes/tags.
- Workspace analytics strips query/fragment values before Vercel analytics and uses an aggregate Supabase fallback without user/store/product/bank/financial identifiers.
- `finance-ai` is JWT-protected, rate-limited, rejects obvious personal-data patterns in the short question, builds a minimized aggregate evidence pack, requests `store:false`, validates every model evidence ID and falls back to deterministic analysis on provider/validation failure.
- The AI model has no write/action tools for price changes, payouts, billing, marketplace mutations or accounting postings in this implementation.

## Primary official references used for this draft

- KVKK — Aydınlatma Yükümlülüğü: https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-
- KVKK — Aydınlatma Tebliği: https://www.kvkk.gov.tr/Icerik/4132/aydinlatma-yukumlulugunun-yerine-getirilmesinde-uyulacak-usul-ve-esaslar-hakkinda-teblig
- KVKK — İlgili Kişinin Hakları: https://www.kvkk.gov.tr/Icerik/2036/Ilgili-Kisinin-Haklari
- KVKK — Yurt Dışına Aktarım: https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim
- KVKK — Standard Contracts: https://www.kvkk.gov.tr/Icerik/7929/Standart-Sozlesmeler
- KVKK — Üretken Yapay Zekâ ve Kişisel Verilerin Korunması Rehberi: https://www.kvkk.gov.tr/Icerik/8547/uretken-yapay-zeka-ve-kisisel-verilerin-korunmasi-rehberi-15-soruda
- Vercel Web Analytics privacy/compliance: https://vercel.com/docs/analytics/privacy-policy
- OpenAI API / Responses: https://platform.openai.com/overview

## Release rule

**Do not change the status text on the public legal pages from “preparation/draft” to “effective/final”, and do not set `KARKALKAN_LEGAL_PAGES_FINAL=true`, until all blocking items that apply to the production operator are signed off.**
