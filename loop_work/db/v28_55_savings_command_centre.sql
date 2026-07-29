-- LOOP v28.55 - Savings command centre
-- Adds movement logging, provider auto-relationship repair and savings optimiser support.

alter table if exists public.financial_accounts
  add column if not exists balance_last_confirmed_value numeric(14,2),
  add column if not exists balance_last_confirmed_at timestamptz,
  add column if not exists interest_accrual_frequency text default 'daily',
  add column if not exists interest_compounding_frequency text default 'monthly';

create table if not exists public.savings_account_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_user_id uuid,
  created_by_user_id uuid,
  household_id uuid,
  visibility_scope text not null default 'private',
  financial_account_id uuid not null references public.financial_accounts(id) on delete cascade,
  movement_type text not null default 'deposit',
  amount numeric(14,2) not null default 0,
  resulting_balance numeric(14,2),
  effective_at date not null default current_date,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_account_movements_type_check check (movement_type in ('deposit','withdrawal','interest','fee','balance_correction','transfer_in','transfer_out','manual_adjustment')),
  constraint savings_account_movements_visibility_check check (visibility_scope in ('private','household'))
);

create index if not exists savings_account_movements_account_idx
  on public.savings_account_movements(financial_account_id, effective_at desc);
create index if not exists savings_account_movements_user_idx
  on public.savings_account_movements(user_id, effective_at desc);
create index if not exists savings_account_movements_household_idx
  on public.savings_account_movements(household_id, visibility_scope, effective_at desc);

alter table public.savings_account_movements enable row level security;

drop policy if exists "savings movements own or household" on public.savings_account_movements;
create policy "savings movements own or household"
  on public.savings_account_movements
  for all
  using (
    auth.uid() = user_id
    or (
      visibility_scope = 'household'
      and household_id is not null
      and exists (
        select 1
        from public.app_household_members m
        where m.household_id = savings_account_movements.household_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    )
  )
  with check (
    auth.uid() = user_id
    or (
      visibility_scope = 'household'
      and household_id is not null
      and exists (
        select 1
        from public.app_household_members m
        where m.household_id = savings_account_movements.household_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    )
  );

-- Repair duplicate provider relationship rows before enforcing upsert safety.
with ranked as (
  select id,
         row_number() over (partition by user_id, provider_slug order by updated_at desc nulls last, created_at desc nulls last, id desc) as rn
  from public.user_financial_provider_relationships
  where provider_slug is not null and provider_slug <> ''
)
delete from public.user_financial_provider_relationships r
using ranked d
where r.id = d.id and d.rn > 1;

create unique index if not exists user_financial_provider_relationships_user_provider_uidx
  on public.user_financial_provider_relationships(user_id, provider_slug);

-- Existing tracked savings accounts count as held providers for eligibility logic.
insert into public.user_financial_provider_relationships(user_id, provider_slug, provider_name, relationship_type, is_active, notes, updated_at)
select distinct
  fa.user_id,
  fa.provider_slug,
  coalesce(nullif(fa.provider, ''), fa.provider_slug),
  'savings_account',
  true,
  'Auto-added from tracked savings account so savings-deal eligibility can use it.',
  now()
from public.financial_accounts fa
where coalesce(fa.is_liability, false) = false
  and coalesce(fa.account_type, '') <> 'current_account'
  and fa.provider_slug is not null
  and fa.provider_slug <> ''
on conflict (user_id, provider_slug) do update
set provider_name = coalesce(excluded.provider_name, public.user_financial_provider_relationships.provider_name),
    relationship_type = case
      when public.user_financial_provider_relationships.relationship_type in ('existing_customer','current_account','member') then public.user_financial_provider_relationships.relationship_type
      else excluded.relationship_type
    end,
    is_active = true,
    notes = coalesce(public.user_financial_provider_relationships.notes, excluded.notes),
    updated_at = now();

-- Keep future recommendation upserts safe if old partial migrations missed this index.
create unique index if not exists savings_rate_recommendations_unique_idx
  on public.savings_rate_recommendations(user_id, financial_account_id, savings_rate_deal_id);

create index if not exists savings_rate_deals_active_rate_idx
  on public.savings_rate_deals(status, gross_aer desc nulls last);

-- Optional metadata marker so Admin can see this feature was installed.
create table if not exists public.app_beta_flags (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null,
  label text,
  scope text not null default 'site',
  description text,
  enabled boolean not null default false,
  rollout_percent integer not null default 0,
  requires_admin_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_beta_flags_flag_key_uidx on public.app_beta_flags(flag_key);

insert into public.app_beta_flags(flag_key, label, scope, description, enabled, rollout_percent, requires_admin_approval)
values (
  'savings_command_centre_v2855',
  'Savings command centre',
  'wealth',
  'Tabbed savings page, provider eligibility, movement logs, AI savings score and pension-aware projections.',
  true,
  100,
  false
)
on conflict (flag_key) do update
set label = excluded.label,
    description = excluded.description,
    enabled = true,
    rollout_percent = 100,
    updated_at = now();
