begin;

create table if not exists public.financial_position_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  net_worth numeric not null default 0,
  total_assets numeric not null default 0,
  total_liabilities numeric not null default 0,
  investment_value numeric not null default 0,
  savings_value numeric not null default 0,
  pension_value numeric not null default 0,
  property_equity numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, snapshot_date)
);

create table if not exists public.financial_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  briefing_date date not null,
  scope text not null default 'household',
  status text not null default 'ready',
  headline text,
  briefing_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  model_key text not null default 'deterministic-v1',
  prompt_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, briefing_date, scope)
);

create table if not exists public.financial_briefing_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  briefing_id uuid references public.financial_briefings(id) on delete cascade,
  feedback text not null check (feedback in ('helpful','not_helpful','dismissed')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.financial_position_snapshots enable row level security;
alter table public.financial_briefings enable row level security;
alter table public.financial_briefing_feedback enable row level security;

drop policy if exists financial_position_snapshots_owner on public.financial_position_snapshots;
create policy financial_position_snapshots_owner on public.financial_position_snapshots for select using (auth.uid() = user_id);
drop policy if exists financial_briefings_owner on public.financial_briefings;
create policy financial_briefings_owner on public.financial_briefings for select using (auth.uid() = user_id);
drop policy if exists financial_briefing_feedback_owner on public.financial_briefing_feedback;
create policy financial_briefing_feedback_owner on public.financial_briefing_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into public.app_tier_features(feature_key, category, name, description, is_active)
values ('ai_financial_briefing','AI & intelligence','AI financial briefing','Premium daily landing page covering net worth, portfolio, savings, home and Financial Flow.',true)
on conflict (feature_key) do update set name=excluded.name, description=excluded.description, is_active=true;

insert into public.app_tier_plan_features(plan_slug,feature_key,enabled,enforcement_mode,user_message)
select p.slug,'ai_financial_briefing',(p.slug in ('pro','premium')),'hard_gate','Upgrade to unlock your personalised daily financial briefing.'
from public.app_tier_plans p
on conflict (plan_slug,feature_key) do update set enabled=excluded.enabled,enforcement_mode=excluded.enforcement_mode,user_message=excluded.user_message;

insert into public.loop_plan_features(tier_key,feature_key,feature_label,enabled,description)
select t.tier_key,'ai_financial_briefing','AI financial briefing',(t.tier_key in ('pro','premium')),'Personalised daily household financial briefing.'
from public.loop_plan_tiers t
on conflict (tier_key,feature_key) do update set enabled=excluded.enabled,feature_label=excluded.feature_label,description=excluded.description;

commit;
