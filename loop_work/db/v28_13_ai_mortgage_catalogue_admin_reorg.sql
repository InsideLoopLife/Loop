-- LOOP v28.13 - AI mortgage catalogue, user flags and admin product-nav grouping
-- Run after v28_12. This keeps beta deal ingestion provider-light: source pages are checked,
-- parsed into reviewable rows, and only active/admin-approved rows can be shown to users.

alter table if exists public.mortgage_rate_deals
  add column if not exists catalogue_status text not null default 'needs_review',
  add column if not exists ingestion_method text not null default 'manual',
  add column if not exists source_id uuid references public.mortgage_lender_sources(id) on delete set null,
  add column if not exists external_product_key text,
  add column if not exists admin_review_reason text,
  add column if not exists broken_report_count integer not null default 0,
  add column if not exists last_broken_report_at timestamptz,
  add column if not exists fixed_at timestamptz,
  add column if not exists fixed_by uuid references auth.users(id) on delete set null,
  add column if not exists fixed_notification_sent_at timestamptz,
  add column if not exists removed_detected_at timestamptz,
  add column if not exists last_admin_checked_at timestamptz;

create unique index if not exists mortgage_rate_deals_external_product_key_idx
  on public.mortgage_rate_deals(external_product_key);

create index if not exists mortgage_rate_deals_catalogue_review_idx
  on public.mortgage_rate_deals(catalogue_status, status, broken_report_count desc, updated_at desc);

create table if not exists public.mortgage_rate_deal_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mortgage_rate_deal_id uuid references public.mortgage_rate_deals(id) on delete cascade,
  mortgage_renewal_recommendation_id uuid references public.mortgage_renewal_recommendations(id) on delete set null,
  issue_kind text not null default 'broken_or_wrong',
  detail text,
  status text not null default 'open',
  admin_notes text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  fixed_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mortgage_rate_deal_flags_status_check check (status in ('open','checking','resolved','dismissed'))
);

create index if not exists mortgage_rate_deal_flags_admin_idx
  on public.mortgage_rate_deal_flags(status, created_at desc);
create index if not exists mortgage_rate_deal_flags_user_idx
  on public.mortgage_rate_deal_flags(user_id, status, created_at desc);

alter table public.mortgage_rate_deal_flags enable row level security;

drop policy if exists "mortgage flags own read" on public.mortgage_rate_deal_flags;
create policy "mortgage flags own read" on public.mortgage_rate_deal_flags
  for select using (auth.uid() = user_id);

drop policy if exists "mortgage flags own insert" on public.mortgage_rate_deal_flags;
create policy "mortgage flags own insert" on public.mortgage_rate_deal_flags
  for insert with check (auth.uid() = user_id);

drop policy if exists "mortgage flags admin all" on public.mortgage_rate_deal_flags;
create policy "mortgage flags admin all" on public.mortgage_rate_deal_flags
  for all using (
    exists (
      select 1 from public.app_admin_users au
      join auth.users u on lower(u.email) = lower(au.email)
      where u.id = auth.uid() and au.status = 'active'
    )
  ) with check (
    exists (
      select 1 from public.app_admin_users au
      join auth.users u on lower(u.email) = lower(au.email)
      where u.id = auth.uid() and au.status = 'active'
    )
  );

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('mortgage_catalogue_refresh_limit', '12', 'Maximum mortgage lender source pages checked per catalogue refresh run.'),
  ('mortgage_catalogue_auto_publish_confidence', '95', 'Minimum confidence required before a sourced mortgage deal can be marked active automatically. Keep high during beta.')
on conflict (setting_key) do nothing;

insert into public.app_future_integration_tasks(product_key, task_key, title, description, section, priority, metadata)
values
('mortgage_catalogue', 'admin-house-nav-live', 'Use Admin > House as the product home', 'Mortgage sources, mortgage catalogue, reported deal issues, valuation automation, EPC/council-tax logic and moving-home setup should live under the House admin nav with tabs, not scattered through Wealth Watch.', 'Admin rework', 120, '{}'::jsonb),
('mortgage_catalogue', 'ai-source-catalogue', 'Run AI/source mortgage catalogue refresh', 'LOOP checks lender source pages, extracts possible mortgage rows into mortgage_rate_deals as needs_review, and never shows them to users until active/admin-approved.', 'Catalogue', 130, '{}'::jsonb),
('mortgage_catalogue', 'admin-review-before-publish', 'Review extracted mortgage products before publishing', 'Admins should verify lender, term, LTV, fee, source link and confidence before switching a catalogue row to active.', 'Catalogue', 140, '{}'::jsonb),
('mortgage_catalogue', 'user-flag-fix-notify', 'Close the user flag loop', 'Users can flag broken/wrong mortgage products. Admin sees flagged rows, fixes the link/data, and marks fixed so affected users receive an in-app notification.', 'Quality loop', 150, '{}'::jsonb),
('property_enrichment', 'listing-epc-council-tax', 'Use property listings for EPC/council-tax enrichment', 'Rightmove/Zoopla/OnTheMarket listings often expose EPC and council-tax band. Extract what is present, let users input new-build/missing values, and keep confidence/source trail visible.', 'Property enrichment', 210, '{}'::jsonb),
('property_enrichment', 'uprn-source-decision', 'Choose licensed UPRN automation route', 'FindMyAddress is useful for personal/manual checks but should not be scraped for commercial automation. Use OS Open UPRN/OS Data Hub or a licensed address provider for production.', 'Address identity', 220, '{"manual_spot_check":"https://www.findmyaddress.co.uk/search"}'::jsonb),
('admin_rework', 'domain-nav-tabs', 'Restructure admin by product domain', 'Move investment pages under Admin > Investments tabs, house/mortgage/valuation under Admin > House tabs, and savings/deal-watch under Admin > Savings tabs.', 'Admin rework', 300, '{}'::jsonb)
on conflict (product_key, task_key) do update set
  title = excluded.title,
  description = excluded.description,
  section = excluded.section,
  priority = excluded.priority,
  metadata = excluded.metadata,
  updated_at = now();
