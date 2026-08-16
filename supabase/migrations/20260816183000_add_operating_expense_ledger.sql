create table if not exists public.marketplace_operating_expenses (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('ads','packaging','rent','payroll','software','other')),
  label text not null check (char_length(label) between 1 and 120),
  amount numeric(18,2) not null check (amount >= 0),
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_operating_expenses_period_check check (period_end >= period_start),
  constraint marketplace_operating_expenses_connection_owner_fkey foreign key (connection_id,user_id) references public.marketplace_connections(id,user_id) on delete cascade
);

create index if not exists marketplace_operating_expenses_connection_period_idx on public.marketplace_operating_expenses(connection_id,period_start,period_end);
create index if not exists marketplace_operating_expenses_user_period_idx on public.marketplace_operating_expenses(user_id,period_start,period_end);

alter table public.marketplace_operating_expenses enable row level security;
revoke all on table public.marketplace_operating_expenses from anon, authenticated;
grant select on table public.marketplace_operating_expenses to authenticated;
create policy marketplace_operating_expenses_select_own on public.marketplace_operating_expenses for select to authenticated using ((select auth.uid())=user_id);
