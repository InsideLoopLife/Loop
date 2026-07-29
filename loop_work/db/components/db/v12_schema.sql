-- V12: Mortgage balance projection support.
-- Lets a mortgage store its opening/last-known balance date and project today's balance as payments are made.

alter table if exists home_mortgage_deals
  add column if not exists balance_as_of_date date,
  add column if not exists repayment_type text not null default 'repayment';

update home_mortgage_deals
set balance_as_of_date = coalesce(balance_as_of_date, start_date, created_at::date, current_date)
where balance_as_of_date is null;

alter table if exists home_mortgage_deals
  drop constraint if exists home_mortgage_deals_repayment_type_check;

alter table if exists home_mortgage_deals
  add constraint home_mortgage_deals_repayment_type_check
  check (repayment_type in ('repayment', 'interest_only'));

notify pgrst, 'reload schema';
