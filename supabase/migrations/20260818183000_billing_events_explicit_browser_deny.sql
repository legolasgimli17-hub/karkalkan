-- Keep the verified Paddle idempotency ledger service-only while making the
-- browser denial explicit to humans and database security tooling.
create policy billing_events_deny_browser
on public.billing_events
for all
to anon, authenticated
using (false)
with check (false);
