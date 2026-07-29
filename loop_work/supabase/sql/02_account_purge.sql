-- Inside LOOP instant account purge support
-- Deletes rows from public tables where the target user clearly owns the row.
-- Deliberately preserves admin_audit_log and account_deletion_requests.

create schema if not exists private;

create or replace function private.loop_purge_user_core_data(target_user_id uuid, target_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  rec record;
  fqtn text;
  col text;
  deleted_count bigint;
  summary jsonb := '[]'::jsonb;
  item jsonb;
  err text;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  insert into public.account_deletion_requests(user_id, email, status, confirmation_text, requested_at)
  values (target_user_id, target_email, 'purging', 'DELETE', now());

  for rec in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and c.relname not in ('admin_audit_log','account_deletion_requests','app_settings','beta_access_codes')
  loop
    fqtn := 'public.' || quote_ident(rec.table_name);
    col := null;
    err := null;
    deleted_count := 0;

    if rec.table_name = 'profiles' and exists (select 1 from information_schema.columns where table_schema='public' and table_name=rec.table_name and column_name='id') then
      col := 'id';
    elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name=rec.table_name and column_name='user_id') then
      col := 'user_id';
    elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name=rec.table_name and column_name='owner_id') then
      col := 'owner_id';
    elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name=rec.table_name and column_name='profile_id') then
      col := 'profile_id';
    elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name=rec.table_name and column_name='created_by') then
      col := 'created_by';
    end if;

    if col is not null then
      begin
        execute format('delete from %s where %I = $1', fqtn, col) using target_user_id;
        get diagnostics deleted_count = row_count;
      exception when others then
        err := sqlerrm;
      end;

      item := jsonb_build_object('table', rec.table_name, 'column', col, 'deleted', deleted_count, 'error', err);
      summary := summary || jsonb_build_array(item);
    end if;
  end loop;

  update public.account_deletion_requests
  set status = case
      when exists (select 1 from jsonb_array_elements(summary) x where x->>'error' is not null and x->>'error' <> '') then 'failed'
      else 'purged'
    end,
    purged_at = now(),
    purge_summary = summary
  where user_id = target_user_id and status = 'purging';

  return summary;
end;
$$;

revoke all on function private.loop_purge_user_core_data(uuid, text) from public;
revoke all on function private.loop_purge_user_core_data(uuid, text) from anon;
revoke all on function private.loop_purge_user_core_data(uuid, text) from authenticated;
