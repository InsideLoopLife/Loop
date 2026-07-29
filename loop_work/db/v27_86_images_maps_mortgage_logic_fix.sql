-- v27.86 image/map/mortgage logic support
-- Run after v27.85.2. This is safe to rerun.

-- 1) Make sure avatar/household image buckets exist for Ajax uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('user-avatars', 'user-avatars', true, 5000000, array['image/jpeg','image/png','image/webp','image/gif']),
  ('household-images', 'household-images', true, 5000000, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Policies are intentionally scoped by the first folder segment matching auth.uid().
drop policy if exists "loop_user_avatars_read" on storage.objects;
drop policy if exists "loop_user_avatars_insert_own_folder" on storage.objects;
drop policy if exists "loop_user_avatars_update_own_folder" on storage.objects;
drop policy if exists "loop_household_images_read" on storage.objects;
drop policy if exists "loop_household_images_insert_own_folder" on storage.objects;
drop policy if exists "loop_household_images_update_own_folder" on storage.objects;

create policy "loop_user_avatars_read"
on storage.objects for select
to public
using (bucket_id = 'user-avatars');

create policy "loop_user_avatars_insert_own_folder"
on storage.objects for insert
to authenticated
with check (bucket_id = 'user-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "loop_user_avatars_update_own_folder"
on storage.objects for update
to authenticated
using (bucket_id = 'user-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'user-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "loop_household_images_read"
on storage.objects for select
to public
using (bucket_id = 'household-images');

create policy "loop_household_images_insert_own_folder"
on storage.objects for insert
to authenticated
with check (bucket_id = 'household-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "loop_household_images_update_own_folder"
on storage.objects for update
to authenticated
using (bucket_id = 'household-images' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'household-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2) Backfill linked household people names/images from claimed account profiles.
update public.people p
set
  name = coalesce(nullif(up.full_name, ''), nullif(up.display_name, ''), nullif(p.name, ''), split_part(coalesce(up.email, p.email, ''), '@', 1), 'Household member'),
  email = coalesce(up.email, p.email),
  invite_email = coalesce(up.email, p.invite_email, p.email),
  avatar_url = coalesce(up.avatar_url, p.avatar_url),
  account_status = 'linked',
  updated_at = now()
from public.app_user_profiles up
where p.linked_user_id = up.user_id
  and (
    p.name is null
    or p.name = ''
    or lower(p.name) = lower(split_part(coalesce(p.email, up.email, ''), '@', 1))
    or p.avatar_url is null
  );
