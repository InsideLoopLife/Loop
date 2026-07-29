-- v27.46 hotfix: nutrition correction metadata + SnapTrade readiness

alter table meals add column if not exists card_kind text;
alter table meals add column if not exists brand_name text;
alter table meals add column if not exists product_data_source text;
alter table meals add column if not exists product_data_confidence numeric default 0;
alter table meals add column if not exists product_image_url text;
alter table meals add column if not exists product_source_url text;
alter table meals add column if not exists product_lookup_json jsonb default '{}'::jsonb;
alter table meals add column if not exists nutrition_json jsonb default '{}'::jsonb;

create table if not exists nutrition_product_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid,
  label text not null,
  source_url text,
  label_image_url text,
  notes text,
  status text not null default 'queued',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table nutrition_product_corrections enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'nutrition_product_corrections' and policyname = 'nutrition corrections owner access') then
    create policy "nutrition corrections owner access" on nutrition_product_corrections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- SnapTrade uses integration_secrets for the per-user SnapTrade userSecret.
-- Provider names used by the app:
--   snaptrade_user_secret
-- Environment values required server-side only:
--   SNAPTRADE_CLIENT_ID
--   SNAPTRADE_CONSUMER_KEY
