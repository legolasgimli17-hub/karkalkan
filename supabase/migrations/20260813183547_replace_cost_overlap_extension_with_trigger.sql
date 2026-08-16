alter table public.marketplace_product_costs drop constraint if exists marketplace_product_costs_no_overlap;
drop extension if exists btree_gist;

create or replace function karkalkan_private.prevent_product_cost_overlap()
returns trigger
language plpgsql
set search_path = pg_catalog, public, karkalkan_private
as $$
begin
  if exists (
    select 1
    from public.marketplace_product_costs p
    where p.connection_id = new.connection_id
      and p.external_product_id = new.external_product_id
      and p.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(p.valid_from, coalesce(p.valid_to + 1, 'infinity'::date), '[)')
          && daterange(new.valid_from, coalesce(new.valid_to + 1, 'infinity'::date), '[)')
  ) then
    raise exception using errcode='23P01', message='PRODUCT_COST_PERIOD_OVERLAP';
  end if;
  return new;
end;
$$;

revoke all on function karkalkan_private.prevent_product_cost_overlap() from public, anon, authenticated;

drop trigger if exists trg_product_cost_no_overlap on public.marketplace_product_costs;
create trigger trg_product_cost_no_overlap
before insert or update of connection_id, external_product_id, valid_from, valid_to
on public.marketplace_product_costs
for each row
execute function karkalkan_private.prevent_product_cost_overlap();
