-- Life Tracker V23: LoopWealth/LoopHealth IA + pension/investment scalability fixes
-- Safe to run after V22. Adds NI top-up flag and improves precision for fractional holdings/UK GBX pricing.

alter table pension_accounts
  add column if not exists employer_ni_topup_enabled boolean not null default false;

update pension_accounts
set employer_ni_topup_enabled = true
where coalesce(employer_ni_topup_percent, 0) > 0;

alter table investment_holdings
  add column if not exists price_quote_unit text not null default 'gbp';

alter table investment_holdings
  alter column units type numeric(24,8),
  alter column average_buy_price type numeric(18,8),
  alter column latest_price type numeric(18,8);

alter table investment_price_snapshots
  alter column units type numeric(24,8),
  alter column price type numeric(18,8);

create table if not exists investment_bulk_import_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid references investment_accounts(id) on delete cascade,
  label text not null default 'Bulk import',
  source text,
  rows_imported integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table investment_bulk_import_notes enable row level security;

drop policy if exists investment_bulk_import_notes_select_own on investment_bulk_import_notes;
create policy investment_bulk_import_notes_select_own on investment_bulk_import_notes for select using ((select auth.uid()) = user_id);
drop policy if exists investment_bulk_import_notes_insert_own on investment_bulk_import_notes;
create policy investment_bulk_import_notes_insert_own on investment_bulk_import_notes for insert with check ((select auth.uid()) = user_id);
drop policy if exists investment_bulk_import_notes_update_own on investment_bulk_import_notes;
create policy investment_bulk_import_notes_update_own on investment_bulk_import_notes for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists investment_bulk_import_notes_delete_own on investment_bulk_import_notes;
create policy investment_bulk_import_notes_delete_own on investment_bulk_import_notes for delete using ((select auth.uid()) = user_id);

create index if not exists investment_bulk_import_notes_user_account_idx on investment_bulk_import_notes(user_id, investment_account_id, created_at desc);

notify pgrst, 'reload schema';
