-- V24.4: account email, household auto-init support, avatar storage limits.

alter table if exists app_households
  add column if not exists email_from_name text,
  add column if not exists email_reply_to text,
  add column if not exists household_slug text;

alter table if exists app_household_members
  add column if not exists email text,
  add column if not exists permission_tier text default 'member',
  add column if not exists can_manage_people boolean default false,
  add column if not exists can_manage_child_profiles boolean default false,
  add column if not exists can_view_household_income boolean default false,
  add column if not exists can_manage_household_costs boolean default false,
  add column if not exists can_manage_integrations boolean default false;

alter table if exists people
  add column if not exists linked_user_id uuid,
  add column if not exists account_setup_prompted_at timestamptz,
  add column if not exists invite_email text,
  add column if not exists account_status text default 'managed_by_household',
  add column if not exists household_id uuid references app_households(id) on delete set null;

alter table if exists app_user_profiles
  add column if not exists avatar_url text,
  add column if not exists full_name text,
  add column if not exists phone_number text,
  add column if not exists identity_verification_status text default 'unverified';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('user-avatars', 'user-avatars', true, 5000000, array['image/jpeg','image/png','image/webp','image/gif']),
  ('person-avatars', 'person-avatars', true, 5000000, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies are deliberately user-path scoped. These may need owner-specific tuning before public release.
drop policy if exists "user_avatars_read_public" on storage.objects;
create policy "user_avatars_read_public" on storage.objects
for select using (bucket_id = 'user-avatars');

drop policy if exists "person_avatars_read_public" on storage.objects;
create policy "person_avatars_read_public" on storage.objects
for select using (bucket_id = 'person-avatars');

drop policy if exists "user_avatars_insert_own_path" on storage.objects;
create policy "user_avatars_insert_own_path" on storage.objects
for insert with check (bucket_id = 'user-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "person_avatars_insert_own_path" on storage.objects;
create policy "person_avatars_insert_own_path" on storage.objects
for insert with check (bucket_id = 'person-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "user_avatars_update_own_path" on storage.objects;
create policy "user_avatars_update_own_path" on storage.objects
for update using (bucket_id = 'user-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "person_avatars_update_own_path" on storage.objects;
create policy "person_avatars_update_own_path" on storage.objects
for update using (bucket_id = 'person-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

notify pgrst, 'reload schema';
