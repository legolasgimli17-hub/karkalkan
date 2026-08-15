-- Cover the auth.users foreign key used by cargo invoice item cleanup and ownership paths.
create index if not exists marketplace_cargo_invoice_items_user_idx
  on public.marketplace_cargo_invoice_items(user_id);
