## Purpose

Describe the user or operational outcome.

## Risk and data impact

- Tenant isolation / RLS impact:
- Authentication or secret impact:
- Financial-calculation impact:
- New environment variables or migrations:

## Verification

- [ ] `node --test tests/*.test.mjs`
- [ ] JavaScript and Edge Function syntax checks
- [ ] No real secrets, tokens, seller data or customer data added
- [ ] Preview verified on the canonical user flow
- [ ] Supabase advisors checked after database changes
- [ ] Rollback path documented for risky changes

## Evidence

Add test output, screenshots or safe reproduction notes as applicable.
