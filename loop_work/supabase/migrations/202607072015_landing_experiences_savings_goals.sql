-- v28.68 Landing experiences + savings pot goals
-- Adds optional goal metadata directly to savings/cash financial accounts.

alter table if exists public.financial_accounts
  add column if not exists savings_goal_name text,
  add column if not exists savings_goal_target_amount numeric(14,2),
  add column if not exists savings_goal_target_date date,
  add column if not exists savings_goal_monthly_contribution_override numeric(14,2),
  add column if not exists savings_goal_priority integer,
  add column if not exists savings_goal_status text default 'active';

create index if not exists idx_financial_accounts_savings_goal_active
  on public.financial_accounts(user_id, savings_goal_status, savings_goal_target_date)
  where coalesce(is_liability, false) = false and savings_goal_target_amount is not null;

comment on column public.financial_accounts.savings_goal_name is 'Optional user-facing name for this savings pot goal, e.g. emergency fund or holiday.';
comment on column public.financial_accounts.savings_goal_target_amount is 'Optional target balance for the savings pot.';
comment on column public.financial_accounts.savings_goal_target_date is 'Optional date the user wants this pot funded by.';
comment on column public.financial_accounts.savings_goal_monthly_contribution_override is 'Optional monthly contribution used for goal modelling when different to the account top-up.';
comment on column public.financial_accounts.savings_goal_priority is 'Optional ordering hint for user-facing savings goals.';
comment on column public.financial_accounts.savings_goal_status is 'active, paused, achieved or archived.';
