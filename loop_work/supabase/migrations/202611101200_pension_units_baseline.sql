-- Units held "as of" a date: confirmed purchases after it add units, and a
-- value the person enters resets it. Backfilled from the latest purchase the
-- provider confirmed (the units on file include it).
alter table public.pension_funds add column if not exists units_as_of_date date;
alter table public.pension_contribution_events add column if not exists units_applied boolean not null default false;

update public.pension_funds f
set units_as_of_date = sub.last_confirmed
from (
  select pension_fund_id, max(investment_date) as last_confirmed
  from public.pension_contribution_events
  where event_status = 'invested'
    and source in ('provider_statement', 'manual_reconciliation')
    and pension_fund_id is not null
  group by pension_fund_id
) sub
where sub.pension_fund_id = f.id and f.units_as_of_date is null;
