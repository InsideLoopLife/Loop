-- V27.1 household/account polish
-- Safe to run multiple times.

alter table if exists app_households
  add column if not exists image_url text;

-- Buckets for household images. Public read is used by the current prototype UI; tighten before public launch if needed.
insert into storage.buckets (id, name, public)
values ('household-images', 'household-images', true)
on conflict (id) do update set public = excluded.public;

-- Rerunnable storage policies. Supabase may throw if the policy does not exist, so wrap in DO.
do $$ begin
  drop policy if exists "household images are publicly readable" on storage.objects;
  drop policy if exists "users can upload household images" on storage.objects;
  drop policy if exists "users can update household images" on storage.objects;
exception when undefined_object then null;
end $$;

create policy "household images are publicly readable"
on storage.objects for select
to public
using (bucket_id = 'household-images');

create policy "users can upload household images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'household-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "users can update household images"
on storage.objects for update
to authenticated
using (bucket_id = 'household-images' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'household-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- Helpful indexes for invite lookups.
create index if not exists household_join_invites_short_code_idx on household_join_invites(short_code);
create index if not exists household_join_invites_invited_email_idx on household_join_invites(invited_email);
create index if not exists household_join_invites_invited_email_hash_idx on household_join_invites(invited_email_hash);
