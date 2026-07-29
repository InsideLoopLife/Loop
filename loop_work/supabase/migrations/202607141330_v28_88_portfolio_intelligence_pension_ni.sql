begin;

alter table public.pension_accounts
  add column if not exists employer_ni_passback_percent numeric not null default 0,
  add column if not exists employer_base_salary_basis text not null default 'pre_sacrifice';

alter table public.pension_accounts
  drop constraint if exists pension_accounts_employer_ni_passback_percent_check;
alter table public.pension_accounts
  add constraint pension_accounts_employer_ni_passback_percent_check
  check (employer_ni_passback_percent >= 0 and employer_ni_passback_percent <= 100);

alter table public.pension_accounts
  drop constraint if exists pension_accounts_employer_base_salary_basis_check;
alter table public.pension_accounts
  add constraint pension_accounts_employer_base_salary_basis_check
  check (employer_base_salary_basis in ('pre_sacrifice','post_sacrifice'));

-- Existing salary-sacrifice rows that had the NI switch enabled but no fixed top-up
-- were intended to reinvest the employer NI saving. Convert those records to the
-- explicit saved-NI model and default to a full pass-back. Explicit fixed percentages
-- are preserved.
update public.pension_accounts
set
  employer_ni_topup_mode = case
    when coalesce(employer_ni_topup_mode, 'fixed_percent') = 'fixed_percent'
      and coalesce(employer_ni_topup_percent, 0) = 0
      and coalesce(contribution_method, '') = 'salary_sacrifice'
      then 'saved_ni'
    else employer_ni_topup_mode
  end,
  employer_ni_passback_percent = case
    when coalesce(employer_ni_topup_enabled, false) = true
      and coalesce(employer_ni_topup_mode, 'fixed_percent') in ('saved_ni','salary_sacrifice_saved_ni')
      and coalesce(employer_ni_passback_percent, 0) = 0
      then case
        when coalesce(employer_ni_topup_percent, 0) between 0.01 and 100
          then employer_ni_topup_percent
        else 100
      end
    when coalesce(employer_ni_topup_enabled, false) = true
      and coalesce(employer_ni_topup_mode, 'fixed_percent') = 'fixed_percent'
      and coalesce(employer_ni_topup_percent, 0) = 0
      and coalesce(contribution_method, '') = 'salary_sacrifice'
      then 100
    else coalesce(employer_ni_passback_percent, 0)
  end,
  employer_ni_rate_percent = case
    when coalesce(employer_ni_topup_enabled, false) = true
      and coalesce(employer_ni_rate_percent, 0) in (0, 13.8)
      then 15
    else employer_ni_rate_percent
  end,
  updated_at = now()
where coalesce(employer_ni_topup_enabled, false) = true;

comment on column public.pension_accounts.employer_ni_passback_percent is
  'Percentage of the employer NI saving on salary sacrificed pay that is reinvested into the pension.';
comment on column public.pension_accounts.employer_base_salary_basis is
  'Whether the employer base pension percentage is calculated on pre-sacrifice or post-sacrifice salary.';

commit;
