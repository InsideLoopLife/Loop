
-- v27.45 Health quality, product corrections, Lifestyle OS support

-- Product correction queue. Queue-first, process later with AI/scraper worker.
create table if not exists public.nutrition_product_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid references public.meals(id) on delete set null,
  label text not null,
  source_url text,
  label_image_url text,
  notes text,
  status text not null default 'queued' check (status in ('queued','reading_label','ai_review','updated','failed','dismissed')),
  submitted_at timestamptz not null default now(),
  processed_at timestamptz,
  result_json jsonb not null default '{}'::jsonb
);

create index if not exists nutrition_product_corrections_user_status_idx on public.nutrition_product_corrections(user_id, status, submitted_at desc);
create index if not exists nutrition_product_corrections_meal_idx on public.nutrition_product_corrections(meal_id, submitted_at desc);

alter table public.nutrition_product_corrections enable row level security;

drop policy if exists nutrition_product_corrections_owner_select on public.nutrition_product_corrections;
create policy nutrition_product_corrections_owner_select on public.nutrition_product_corrections
for select to authenticated using (user_id = auth.uid());

drop policy if exists nutrition_product_corrections_owner_insert on public.nutrition_product_corrections;
create policy nutrition_product_corrections_owner_insert on public.nutrition_product_corrections
for insert to authenticated with check (user_id = auth.uid());

-- Helpful columns used by the product/recipe distinction. Safe no-ops if already present.
alter table public.meals add column if not exists card_kind text default 'recipe';
alter table public.meals add column if not exists product_source_url text;
alter table public.meals add column if not exists product_image_url text;
alter table public.meals add column if not exists product_data_source text;
alter table public.meals add column if not exists product_data_confidence int default 0;
alter table public.meals add column if not exists product_lookup_json jsonb default '{}'::jsonb;
alter table public.meals add column if not exists label_front_image_url text;
alter table public.meals add column if not exists label_ingredients_image_url text;
alter table public.meals add column if not exists label_nutrition_image_url text;
alter table public.meals add column if not exists user_verified_label boolean default false;

-- Keep this comment near the migration: household invite fallback uses app_accept_household_invite.
-- If household joins still fail locally, run db/v27_8_household_invites_join_and_delete.sql.
