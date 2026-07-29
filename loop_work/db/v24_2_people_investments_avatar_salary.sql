-- V24.2 — person ownership polish, avatar storage and pay-date robustness

-- Public avatar bucket for non-sensitive profile images. Do not use for bank statements, payslips or finance docs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('person-avatars', 'person-avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

do $$
begin
  create policy "Person avatar files are publicly readable"
    on storage.objects for select
    using (bucket_id = 'person-avatars');
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can upload own person avatars"
    on storage.objects for insert
    with check (bucket_id = 'person-avatars' and auth.uid()::text = (storage.foldername(name))[1]);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can update own person avatars"
    on storage.objects for update
    using (bucket_id = 'person-avatars' and auth.uid()::text = (storage.foldername(name))[1])
    with check (bucket_id = 'person-avatars' and auth.uid()::text = (storage.foldername(name))[1]);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can delete own person avatars"
    on storage.objects for delete
    using (bucket_id = 'person-avatars' and auth.uid()::text = (storage.foldername(name))[1]);
exception when duplicate_object then null;
end $$;

alter table if exists people add column if not exists linked_user_id uuid;
alter table if exists people add column if not exists email_verified_at timestamptz;
alter table if exists people add column if not exists invite_email text;
alter table if exists people add column if not exists account_status text default 'managed_by_household';
alter table if exists people add column if not exists income_visible_to_household boolean default true;
alter table if exists people add column if not exists costs_visible_to_household boolean default true;
alter table if exists people add column if not exists household_can_add_costs boolean default true;
alter table if exists people add column if not exists maturity_date date;
alter table if exists people add column if not exists avatar_url text;

alter table if exists pay_events add column if not exists pay_timing text default 'fixed_day';
alter table if exists pay_events add column if not exists pay_day_of_month integer default 28;
alter table if exists pay_events add column if not exists pay_adjustment text default 'previous_workday';

alter table if exists income_entries add column if not exists person_id uuid references people(id) on delete set null;
alter table if exists income_entries add column if not exists pay_timing text default 'fixed_day';
alter table if exists income_entries add column if not exists pay_day_of_month integer default 28;
alter table if exists income_entries add column if not exists payment_adjustment text default 'previous_workday';

alter table if exists investment_accounts add column if not exists person_id uuid references people(id) on delete set null;
alter table if exists pension_accounts add column if not exists person_id uuid references people(id) on delete set null;
alter table if exists defined_benefit_pensions add column if not exists person_id uuid references people(id) on delete set null;

-- Keep the API schema cache fresh after structural changes.
notify pgrst, 'reload schema';
