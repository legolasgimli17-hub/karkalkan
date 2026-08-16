# vNext change boundary

See `VNEXT.md` and `ARCHITECTURE_VNEXT.md` for the product and architecture rationale.

Implemented in this branch:
- distinct obsidian/copper/ice visual identity
- evidence-first seller dashboard hierarchy
- authenticated webhook registration manager
- x-api-key authenticated, retry-safe order-event receiver
- PII-minimized live order signal storage
- live order overview
- signal-then-reconcile architecture
- custom daily finance chart and sales-to-known-cash bridge
- transparent store score with visible weights
- money-leak evidence radar
- regression/integrity tests covering RLS, callback security and finance semantics

Still requires a real seller account for end-to-end marketplace callback and reconciliation validation.
