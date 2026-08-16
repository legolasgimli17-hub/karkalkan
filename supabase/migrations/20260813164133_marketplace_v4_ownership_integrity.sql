alter table public.marketplace_connections
  add constraint marketplace_connections_id_user_uq unique (id, user_id);

alter table public.marketplace_sync_runs
  add constraint marketplace_sync_runs_connection_owner_fkey
  foreign key (connection_id, user_id)
  references public.marketplace_connections(id, user_id)
  on delete cascade;

alter table public.marketplace_daily_financials
  add constraint marketplace_daily_financials_connection_owner_fkey
  foreign key (connection_id, user_id)
  references public.marketplace_connections(id, user_id)
  on delete cascade;

alter table public.marketplace_product_daily_metrics
  add constraint marketplace_product_daily_metrics_connection_owner_fkey
  foreign key (connection_id, user_id)
  references public.marketplace_connections(id, user_id)
  on delete cascade;

alter table public.marketplace_product_costs
  add constraint marketplace_product_costs_connection_owner_fkey
  foreign key (connection_id, user_id)
  references public.marketplace_connections(id, user_id)
  on delete cascade;

alter table public.marketplace_product_costs
  add constraint marketplace_product_costs_connection_product_valid_from_uq
  unique (connection_id, external_product_id, valid_from);
