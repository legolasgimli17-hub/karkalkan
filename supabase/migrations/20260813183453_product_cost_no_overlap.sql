create extension if not exists btree_gist;

alter table public.marketplace_product_costs
  add constraint marketplace_product_costs_no_overlap
  exclude using gist (
    connection_id with =,
    external_product_id with =,
    daterange(valid_from, coalesce(valid_to + 1, 'infinity'::date), '[)') with &&
  );
