begin;

create index if not exists billing_order_usage_daily_connection_owner_idx
  on public.billing_order_usage_daily(connection_id, user_id);

create index if not exists marketplace_validation_evidence_connection_owner_idx
  on public.marketplace_validation_evidence(connection_id, user_id);

create index if not exists marketplace_fx_import_batches_connection_owner_idx
  on public.marketplace_fx_import_batches(connection_id, user_id);

create index if not exists marketplace_fx_import_daily_connection_owner_idx
  on public.marketplace_fx_import_daily(connection_id, user_id);

commit;
