-- Historical debt balances and user-specific savings-deal eligibility evidence.
create table if not exists public.student_loan_balance_events (
  id uuid primary key default gen_random_uuid(),
  student_loan_account_id uuid not null references public.student_loan_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid null references public.app_households(id) on delete cascade,
  person_id uuid null references public.people(id) on delete set null,
  event_type text not null default 'balance_check' check (event_type in ('opening_balance','balance_check','repayment','interest','adjustment')),
  amount numeric(14,2) null,
  balance_after numeric(14,2) not null,
  effective_at date not null default current_date,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists student_loan_balance_events_account_date_idx
  on public.student_loan_balance_events(student_loan_account_id, effective_at desc, created_at desc);

alter table public.student_loan_balance_events enable row level security;
drop policy if exists "student loan events visible to owner or household" on public.student_loan_balance_events;
create policy "student loan events visible to owner or household"
  on public.student_loan_balance_events for select
  using (
    user_id = auth.uid()
    or household_id in (select household_id from public.app_household_members where user_id = auth.uid() and status = 'active')
  );
drop policy if exists "student loan events writable by owner or household" on public.student_loan_balance_events;
create policy "student loan events writable by owner or household"
  on public.student_loan_balance_events for all
  using (
    user_id = auth.uid()
    or household_id in (select household_id from public.app_household_members where user_id = auth.uid() and status = 'active')
  )
  with check (
    user_id = auth.uid()
    or household_id in (select household_id from public.app_household_members where user_id = auth.uid() and status = 'active')
  );

create table if not exists public.user_savings_deal_eligibility (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  savings_rate_deal_id uuid not null references public.savings_rate_deals(id) on delete cascade,
  eligibility_status text not null default 'unknown' check (eligibility_status in ('unknown','eligible','not_eligible')),
  used_before boolean not null default false,
  note text null,
  updated_at timestamptz not null default now(),
  unique (user_id, savings_rate_deal_id)
);

alter table public.user_savings_deal_eligibility enable row level security;
drop policy if exists "users manage own savings deal eligibility" on public.user_savings_deal_eligibility;
create policy "users manage own savings deal eligibility"
  on public.user_savings_deal_eligibility for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Seed the first thread point for existing loans without changing the live balance.
insert into public.student_loan_balance_events
  (student_loan_account_id, user_id, household_id, person_id, event_type, balance_after, effective_at, note)
select id, user_id, household_id, person_id, 'opening_balance', current_balance, balance_date, 'Opening point imported from the existing student-loan balance'
from public.student_loan_accounts account
where not exists (
  select 1 from public.student_loan_balance_events event
  where event.student_loan_account_id = account.id
);

-- Add clearer day-to-day categories without altering a user's existing assignments.
with categories(name, category_type, icon, category_key) as (
  values
    ('Eating out', 'variable', '🍽️', 'eating_out'),
    ('Transport', 'variable', '🚆', 'transport'),
    ('Car & motoring', 'fixed', '🚗', 'car'),
    ('Holidays', 'variable', '✈️', 'holidays'),
    ('Shopping', 'variable', '🛒', 'shopping'),
    ('Personal care', 'variable', '✨', 'personal_care'),
    ('Pets', 'variable', '🐾', 'pets'),
    ('Gifts & giving', 'variable', '🎁', 'gifts')
), owners as (
  select distinct user_id from public.app_user_profiles where user_id is not null
)
insert into public.spending_categories(user_id, name, type, category_icon, monthly_budget, standard_category_key, is_standard_category)
select owner.user_id, category.name, category.category_type, category.icon, 0, category.category_key, true
from owners owner cross join categories category
where not exists (
  select 1 from public.spending_categories existing
  where existing.user_id = owner.user_id and existing.standard_category_key = category.category_key
);
