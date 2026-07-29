-- v28.60 - harden investment/savings/pension scheduled updates.
-- Adds traceable pension contribution events for salary-sacrifice/NI top-up arrangements,
-- provider-specific investment-day timing, optional investment pie reinvestment lots,
-- and safer savings/investment refresh metadata.

-- Pension account schedule and NI top-up settings.
alter table if exists public.pension_accounts
  add column if not exists employer_ni_topup_mode text default 'fixed_percent',
  add column if not exists employer_ni_rate_percent numeric default 13.8,
  add column if not exists regular_pay_day integer,
  add column if not exists pension_payment_timing text default 'next_working_day',
  add column if not exists contribution_delay_days integer default 0,
  add column if not exists pension_investment_day integer,
  add column if not exists pension_investment_timing text default 'next_working_day',
  add column if not exists contribution_auto_apply_enabled boolean not null default true,
  add column if not exists last_contribution_projection_at timestamptz;

do $$
begin
  if to_regclass('public.pension_accounts') is not null then
    comment on column public.pension_accounts.employer_ni_topup_mode is 'fixed_percent means employer_ni_topup_percent is a direct extra contribution percent. saved_ni means estimate employer NI saved on salary-sacrifice employee contribution using employer_ni_rate_percent.';
    comment on column public.pension_accounts.pension_investment_day is 'Optional day of month when provider normally invests pension contributions after payroll. Used with contribution_delay_days and pension_investment_timing.';
  end if;
end $$;

-- Existing deployments created a unique fund/month constraint. That blocks weekly/fortnightly events,
-- so move idempotency onto an explicit transaction id while keeping contribution_month for grouping.
do $$
begin
  if to_regclass('public.pension_contribution_events') is not null then
    alter table public.pension_contribution_events drop constraint if exists pension_contribution_events_user_id_pension_fund_id_contribution_month_key;

    alter table public.pension_contribution_events
      add column if not exists pension_account_id uuid references public.pension_accounts(id) on delete cascade,
      add column if not exists contribution_due_date date,
      add column if not exists investment_date date,
      add column if not exists employee_amount numeric(14,2) not null default 0,
      add column if not exists employer_amount numeric(14,2) not null default 0,
      add column if not exists employer_ni_topup_amount numeric(14,2) not null default 0,
      add column if not exists fixed_amount numeric(14,2) not null default 0,
      add column if not exists gross_pensionable_pay numeric(14,2),
      add column if not exists allocation_percent numeric(10,4),
      add column if not exists event_status text not null default 'invested',
      add column if not exists external_transaction_id text;

    update public.pension_contribution_events
    set contribution_due_date = coalesce(contribution_due_date, contribution_date),
        investment_date = coalesce(investment_date, contribution_date),
        event_status = coalesce(event_status, 'invested'),
        external_transaction_id = coalesce(external_transaction_id, 'legacy:pension:' || id::text)
    where external_transaction_id is null or contribution_due_date is null or investment_date is null;

    create unique index if not exists pension_contribution_events_external_tx_uidx
      on public.pension_contribution_events(user_id, external_transaction_id)
      where external_transaction_id is not null;
    create index if not exists pension_contribution_events_account_due_idx
      on public.pension_contribution_events(pension_account_id, contribution_due_date desc);
    create index if not exists pension_contribution_events_status_idx
      on public.pension_contribution_events(event_status, investment_date);
  end if;
end $$;

-- Investment purchase lots now distinguish contribution date from execution date and projected lots from confirmed lots.
do $$
begin
  if to_regclass('public.investment_purchase_lots') is not null then
    alter table public.investment_purchase_lots
      add column if not exists contribution_date date,
      add column if not exists execution_date date,
      add column if not exists contribution_source text,
      add column if not exists allocation_percent numeric(10,4),
      add column if not exists native_purchase_price numeric(18,8),
      add column if not exists native_currency text,
      add column if not exists estimated boolean not null default false;

    update public.investment_purchase_lots
    set contribution_date = coalesce(contribution_date, purchase_date),
        execution_date = coalesce(execution_date, purchase_date)
    where contribution_date is null or execution_date is null;

    create index if not exists investment_purchase_lots_execution_idx
      on public.investment_purchase_lots(user_id, execution_date desc);
    create unique index if not exists investment_purchase_lots_external_tx_uidx
      on public.investment_purchase_lots(user_id, external_transaction_id)
      where external_transaction_id is not null;
  end if;
end $$;

-- Optional auto-materialisation of pie/reinvestment assumptions. Defaults to off until a user/admin turns it on.
alter table if exists public.investment_pie_settings
  add column if not exists reinvest_day integer default 1,
  add column if not exists reinvest_delay_days integer not null default 0,
  add column if not exists auto_materialise_reinvestments_enabled boolean not null default false;

-- Savings update hygiene: make source and recommendation data easier to refresh/expire from the one-click optimiser.
alter table if exists public.savings_rate_deals
  add column if not exists extraction_payload jsonb,
  add column if not exists stale_after_days integer default 14;

alter table if exists public.financial_accounts
  add column if not exists savings_last_balance_projection_at timestamptz,
  add column if not exists savings_last_rate_check_at timestamptz;

notify pgrst, 'reload schema';
