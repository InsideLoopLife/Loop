-- V28.101: audit trail for automated price updates, mirroring the fee
-- change log so price writes are also visible and reversible.

create table if not exists provider_fund_price_change_log (
  id uuid primary key default gen_random_uuid(),
  glossary_id uuid references provider_fund_glossary(id) on delete cascade,
  fund_name text,
  previous_price numeric(18,8),
  proposed_price numeric(18,8),
  source text,
  applied boolean not null default false,
  reason text,
  checked_at timestamptz not null default now()
);

alter table provider_fund_price_change_log enable row level security;
drop policy if exists "Admins can read price change log" on provider_fund_price_change_log;
create policy "Admins can read price change log"
on provider_fund_price_change_log for select
to authenticated
using (false);
