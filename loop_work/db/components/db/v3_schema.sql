-- Life Tracker V3 migration
-- Run this if you already installed V2. It adds richer child/nursery cost modelling.

alter table child_costs add column if not exists cost_kind text not null default 'fixed';
alter table child_costs add column if not exists billing_month date;
alter table child_costs add column if not exists daily_rate numeric(12,2) not null default 0;
alter table child_costs add column if not exists extra_daily_cost numeric(12,2) not null default 0;
alter table child_costs add column if not exists funded_hours_per_week numeric(8,2) not null default 0;
alter table child_costs add column if not exists funding_mode text not null default 'none';
alter table child_costs add column if not exists hourly_funding_credit numeric(12,2) not null default 0;
alter table child_costs add column if not exists term_weeks_per_year numeric(8,2) not null default 38;
alter table child_costs add column if not exists monday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists tuesday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists wednesday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists thursday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists friday_hours numeric(8,2) not null default 0;

-- Add check constraints safely, only if they don't already exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'child_costs_cost_kind_check'
  ) then
    alter table child_costs add constraint child_costs_cost_kind_check check (cost_kind in ('fixed', 'nursery'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'child_costs_funding_mode_check'
  ) then
    alter table child_costs add constraint child_costs_funding_mode_check check (funding_mode in ('none', 'stretched', 'term_time'));
  end if;
end $$;

create index if not exists child_costs_child_id_idx on child_costs(child_id);
create index if not exists child_costs_active_dates_idx on child_costs(starts_on, ends_on);
