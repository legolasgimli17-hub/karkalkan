# KârKalkan Evidence-Bound AI Architecture

Reviewed: 2026-08-21

## Principle

The language model is not part of the accounting/calculation boundary. KârKalkan's deterministic finance functions remain authoritative for sales, returns, commission, cargo, platform fees, stoppage, seller revenue, product contribution and confidence metrics.

The AI layer is an explanation layer only.

## Request flow

1. Authenticated user selects a marketplace connection and 7/30-day range.
2. `finance-ai` authenticates the JWT and rate-limits the account.
3. The function calls the existing authenticated `dashboard-summary` and `decision-center` endpoints server-to-server.
4. Only a minimized semantic evidence pack is built:
   - aggregate financial totals,
   - confidence score/label,
   - up to five worst-product aggregate metrics,
   - up to five money-leak signals.
5. Raw orders, customers, bank descriptions, API secrets, OAuth tokens and marketplace credentials are not included in the model payload.
6. If `OPENAI_API_KEY` is configured, the evidence pack and short user question are sent through the OpenAI Responses API with `store:false` and a strict structured-output schema.
7. Each model finding/action must reference existing evidence IDs. Unknown evidence IDs invalidate the model answer.
8. Invalid, unavailable or unconfigured AI responses fall back to the deterministic evidence explanation. Core product functionality therefore does not depend on model availability.

## Guardrails

- JWT required.
- Origin allowlist inherited from the existing Edge auth layer.
- Per-account rate limit.
- User question capped at 500 characters.
- Obvious email/IBAN/long-number personal-data patterns rejected before model invocation.
- No raw order/customer data in the model context.
- No model access to secrets or service-role keys.
- No autonomous financial write/action tools.
- Low-confidence data prioritizes remediation rather than commercial action.
- No conversation history is persisted by KârKalkan in this implementation.
- Model API request uses `store:false`.

## Provider boundary

Server-only environment variables:

- `OPENAI_API_KEY`
- `KARKALKAN_AI_MODEL` (default: `gpt-5.6-luna`)

No API key is exposed to browser code. If the key is absent the workspace displays evidence-only mode rather than pretending a model response exists.

## Privacy / legal handoff

The real operator must complete the KVKK transfer and vendor assessment before turning the AI provider on for commercial use. The public privacy/KVKK drafts describe the AI boundary but remain drafts until the real data controller, application channel, transfer mechanism and retention decisions are completed.

Official references used for the implementation shape:

- OpenAI API overview / Responses API: https://platform.openai.com/overview
- OpenAI API pricing/models: https://platform.openai.com/pricing
- KVKK generative AI guide: https://www.kvkk.gov.tr/Icerik/8547/uretken-yapay-zeka-ve-kisisel-verilerin-korunmasi-rehberi-15-soruda
- KVKK disclosure duty: https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-
- KVKK international transfer: https://www.kvkk.gov.tr/Icerik/2053/Yurtdisina-Aktarim
