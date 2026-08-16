create schema if not exists karkalkan_private;
revoke all on schema karkalkan_private from public, anon, authenticated;

create or replace function karkalkan_private.enforce_sync_reconciliation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, karkalkan_private
as $$
declare
  v_transactions bigint;
  v_start_day date;
  v_end_day date;
begin
  if new.status = 'success' then
    v_start_day := (new.range_start at time zone 'Europe/Istanbul')::date;
    v_end_day := (new.range_end at time zone 'Europe/Istanbul')::date;

    select coalesce(sum(transaction_count), 0)::bigint
      into v_transactions
    from public.marketplace_daily_financials
    where connection_id = new.connection_id
      and user_id = new.user_id
      and day between v_start_day and v_end_day;

    if v_transactions <> new.imported_transactions::bigint then
      raise exception using
        errcode = '23514',
        message = 'SYNC_RECONCILIATION_FAILED',
        detail = 'daily transaction count does not match imported transaction count';
    end if;

    new.result_summary := coalesce(new.result_summary, '{}'::jsonb)
      || jsonb_build_object(
        'db_reconciliation',
        jsonb_build_object(
          'ok', true,
          'transactions', v_transactions,
          'startDay', v_start_day,
          'endDay', v_end_day
        )
      );
  end if;

  return new;
end;
$$;

revoke all on function karkalkan_private.enforce_sync_reconciliation() from public, anon, authenticated;

drop trigger if exists trg_marketplace_sync_reconciliation on public.marketplace_sync_runs;
create trigger trg_marketplace_sync_reconciliation
before update of status, imported_transactions, result_summary
on public.marketplace_sync_runs
for each row
when (new.status = 'success')
execute function karkalkan_private.enforce_sync_reconciliation();
