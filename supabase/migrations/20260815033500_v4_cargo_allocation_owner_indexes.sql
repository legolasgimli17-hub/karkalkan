-- Cover composite owner foreign keys used by the cargo allocation tables.
create index if not exists marketplace_order_product_map_connection_owner_idx
  on public.marketplace_order_product_map(connection_id,user_id);

create index if not exists marketplace_product_cargo_allocations_connection_owner_idx
  on public.marketplace_product_cargo_allocations(connection_id,user_id);
