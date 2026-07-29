-- v28.53 optional storage listing hardening
-- Run only after confirming avatar/household image public URLs still load in your app.
-- It removes broad SELECT policies that let clients list every file in public avatar buckets.
-- Public bucket object URLs should continue to load, but app-side list calls will be blocked.

do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (cmd = 'SELECT' or cmd = 'ALL')
      and (
        qual ilike '%household-images%'
        or qual ilike '%person-avatars%'
        or qual ilike '%user-avatars%'
        or with_check ilike '%household-images%'
        or with_check ilike '%person-avatars%'
        or with_check ilike '%user-avatars%'
      )
      and (
        qual is null
        or qual ilike '%true%'
        or qual ilike '%bucket_id in%'
        or qual ilike '%bucket_id = any%'
        or qual ilike '%household-images%person-avatars%user-avatars%'
      )
  loop
    begin
      execute format('drop policy if exists %I on storage.objects', p.policyname);
      raise notice 'Dropped broad storage SELECT policy %', p.policyname;
    exception when others then
      raise notice 'Could not drop policy %: %', p.policyname, sqlerrm;
    end;
  end loop;
end $$;

-- Keep upload/update/delete to authenticated owners governed by existing policies.
-- If a page needs a non-public/private image later, use signed URLs rather than bucket listing.
