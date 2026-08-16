-- Tighten browser-facing privileges and add covering indexes for composite owner FKs.
-- Server-side sync functions continue to write through trusted database/service credentials.

-- Cargo, order mapping and allocation rows are synchronization artifacts. Browsers only need read access.
revoke all on table public.marketplace_cargo_invoice_items from anon, authenticated;
grant select on table public.marketplace_cargo_invoice_items to authenticated;

drop policy if exists cargo_items_insert_own on public.marketplace_cargo_invoice_items;
drop policy if exists cargo_items_update_own on public.marketplace_cargo_invoice_items;
drop policy if exists cargo_items_delete_own on public.marketplace_cargo_invoice_items;

revoke all on table public.marketplace_order_product_map from anon, authenticated;
grant select on table public.marketplace_order_product_map to authenticated;

revoke all on table public.marketplace_product_cargo_allocations from anon, authenticated;
grant select on table public.marketplace_product_cargo_allocations to authenticated;

-- Composite ownership foreign keys should have matching leading-column indexes.
create index if not exists marketplace_webhooks_connection_owner_idx
  on public.marketplace_webhooks(connection_id, user_id);
create index if not exists marketplace_order_events_connection_owner_idx
  on public.marketplace_order_events(connection_id, user_id);
create index if not exists marketplace_live_orders_connection_owner_idx
  on public.marketplace_live_orders(connection_id, user_id);
create index if not exists marketplace_operating_expenses_connection_owner_idx
  on public.marketplace_operating_expenses(connection_id, user_id);

-- Future public objects must opt browser roles in explicitly instead of inheriting broad grants.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role supabase_admin in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from public, anon, authenticated;
