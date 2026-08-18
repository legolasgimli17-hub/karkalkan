-- Privacy-minimal bank statement imports and explainable marketplace payout reviews.
-- Raw files, full account numbers, IBANs and raw bank references are deliberately not stored.

create table public.bank_statement_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_label text not null,
  account_last4 varchar(4),
  currency varchar(3) not null,
  period_start date not null,
  period_end date not null,
  row_count integer not null,
  file_sha256 char(64) not null,
  source_format text not null default 'normalized_csv',
  created_at timestamptz not null default now(),
  constraint bank_statement_imports_account_label_check
    check (char_length(account_label) between 1 and 80),
  constraint bank_statement_imports_account_last4_check
    check (account_last4 is null or account_last4 ~ '^[A-Za-z0-9]{2,4}$'),
  constraint bank_statement_imports_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint bank_statement_imports_period_check
    check (period_end >= period_start and period_end <= period_start + 370),
  constraint bank_statement_imports_row_count_check
    check (row_count between 1 and 5000),
  constraint bank_statement_imports_file_sha256_check
    check (file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint bank_statement_imports_source_format_check
    check (source_format = 'normalized_csv'),
  constraint bank_statement_imports_user_file_uq unique (user_id, file_sha256),
  constraint bank_statement_imports_id_user_uq unique (id, user_id)
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  row_number integer not null,
  transaction_date date not null,
  value_date date,
  amount numeric(18,2) not null,
  currency varchar(3) not null,
  description_masked text not null default '',
  reference_sha256 char(64),
  provider_hint text,
  created_at timestamptz not null default now(),
  constraint bank_transactions_import_owner_fkey
    foreign key (import_id, user_id)
    references public.bank_statement_imports(id, user_id)
    on delete cascade,
  constraint bank_transactions_row_number_check
    check (row_number between 1 and 5000),
  constraint bank_transactions_amount_check
    check (amount <> 0 and abs(amount) <= 1000000000000),
  constraint bank_transactions_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint bank_transactions_description_masked_check
    check (char_length(description_masked) <= 240),
  constraint bank_transactions_reference_sha256_check
    check (reference_sha256 is null or reference_sha256 ~ '^[0-9a-f]{64}$'),
  constraint bank_transactions_provider_hint_check
    check (provider_hint is null or provider_hint in ('trendyol','hepsiburada','n11','amazon','flo')),
  constraint bank_transactions_import_row_uq unique (import_id, row_number),
  constraint bank_transactions_id_user_uq unique (id, user_id)
);

create table public.bank_reconciliation_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_transaction_id uuid not null,
  connection_id uuid not null,
  range_start date not null,
  range_end date not null,
  expected_amount numeric(18,2) not null,
  bank_amount numeric(18,2) not null,
  difference_amount numeric(18,2) not null,
  confidence text not null,
  status text not null,
  evidence_basis text not null default 'known_cash_window_v1',
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint bank_reconciliation_reviews_transaction_owner_fkey
    foreign key (bank_transaction_id, user_id)
    references public.bank_transactions(id, user_id)
    on delete cascade,
  constraint bank_reconciliation_reviews_connection_owner_fkey
    foreign key (connection_id, user_id)
    references public.marketplace_connections(id, user_id)
    on delete cascade,
  constraint bank_reconciliation_reviews_range_check
    check (range_end >= range_start and range_end <= range_start + 45),
  constraint bank_reconciliation_reviews_amount_check
    check (
      expected_amount >= 0 and expected_amount <= 1000000000000 and
      bank_amount > 0 and bank_amount <= 1000000000000 and
      abs(difference_amount) <= 1000000000000
    ),
  constraint bank_reconciliation_reviews_confidence_check
    check (confidence in ('strong','medium','weak')),
  constraint bank_reconciliation_reviews_status_check
    check (status in ('confirmed','rejected')),
  constraint bank_reconciliation_reviews_evidence_basis_check
    check (evidence_basis = 'known_cash_window_v1'),
  constraint bank_reconciliation_reviews_candidate_uq
    unique (bank_transaction_id, connection_id, range_start, range_end)
);

create index bank_statement_imports_user_created_idx
  on public.bank_statement_imports(user_id, created_at desc);
create index bank_transactions_user_date_idx
  on public.bank_transactions(user_id, transaction_date desc);
create index bank_transactions_user_currency_amount_date_idx
  on public.bank_transactions(user_id, currency, amount, transaction_date desc)
  where amount > 0;
create index bank_transactions_import_owner_idx
  on public.bank_transactions(import_id, user_id);
create index bank_reconciliation_reviews_user_status_idx
  on public.bank_reconciliation_reviews(user_id, status, reviewed_at desc);
create index bank_reconciliation_reviews_transaction_owner_idx
  on public.bank_reconciliation_reviews(bank_transaction_id, user_id);
create index bank_reconciliation_reviews_connection_owner_idx
  on public.bank_reconciliation_reviews(connection_id, user_id);

alter table public.bank_statement_imports enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_reconciliation_reviews enable row level security;

revoke all on table public.bank_statement_imports from public, anon, authenticated;
revoke all on table public.bank_transactions from public, anon, authenticated;
revoke all on table public.bank_reconciliation_reviews from public, anon, authenticated;

grant select on table public.bank_statement_imports to authenticated;
grant select on table public.bank_transactions to authenticated;
grant select on table public.bank_reconciliation_reviews to authenticated;

create policy bank_statement_imports_select_own
on public.bank_statement_imports
for select to authenticated
using ((select auth.uid()) = user_id);

create policy bank_transactions_select_own
on public.bank_transactions
for select to authenticated
using ((select auth.uid()) = user_id);

create policy bank_reconciliation_reviews_select_own
on public.bank_reconciliation_reviews
for select to authenticated
using ((select auth.uid()) = user_id);

comment on table public.bank_statement_imports is
  'Privacy-minimal metadata for normalized bank statement CSV imports; raw files and full account identifiers are never stored.';
comment on column public.bank_transactions.description_masked is
  'Server-redacted description. Email, phone, IBAN and long numeric identifiers are removed before persistence.';
comment on column public.bank_transactions.reference_sha256 is
  'One-way SHA-256 evidence fingerprint; the raw bank reference is not persisted.';
comment on table public.bank_reconciliation_reviews is
  'User review of an explainable payout candidate. A candidate is never automatically treated as accounting proof.';
