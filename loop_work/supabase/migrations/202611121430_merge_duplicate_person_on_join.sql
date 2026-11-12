-- NOT YET APPLIED – waiting for approval.
-- When someone joins a household and already had their own "me" card, and the
-- household already had a card for them (e.g. their partner added them), keep
-- the household card and move everything from the old card onto it, so there's
-- one of them.
create or replace function public.loop_merge_people(p_keep uuid, p_dup uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if p_keep is null or p_dup is null or p_keep = p_dup then return; end if;
  update public.people k set birth_date = coalesce(k.birth_date, d.birth_date), avatar_url = coalesce(k.avatar_url, d.avatar_url)
  from public.people d where k.id = p_keep and d.id = p_dup;
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.people'::regclass
  loop
    begin
      execute format('update %s set %I = %L where %I = %L', r.tbl, r.col, p_keep, r.col, p_dup);
    exception when unique_violation then
      execute format('delete from %s where %I = %L', r.tbl, r.col, p_dup);
    end;
  end loop;
  delete from public.people where id = p_dup;
end;
$$;
revoke all on function public.loop_merge_people(uuid, uuid) from public, anon, authenticated;

do $$
declare def text;
begin
  def := pg_get_functiondef('public.app_accept_household_invite'::regproc);
  if position('loop_merge_people' in def) = 0 then
    def := replace(def, E'  return jsonb_build_object(\r\n    ''ok'', true,', E'  -- One card per person: fold any older "me" card into the household one.\r\n  perform public.loop_merge_people(v_linked_person_id, p.id)\r\n  from public.people p\r\n  where p.user_id = v_user and p.linked_user_id = v_user and p.id <> v_linked_person_id;\r\n\r\n  return jsonb_build_object(\r\n    ''ok'', true,');
    if position('loop_merge_people' in def) = 0 then raise exception 'could not patch accept function'; end if;
    execute def;
  end if;
end $$;
