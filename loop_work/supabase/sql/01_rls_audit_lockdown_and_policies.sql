-- Inside LOOP RLS audit, lockdown and conservative policy generator
-- Run after 00_stage2_core_tables.sql.

create schema if not exists security;

create or replace function security.loop_rls_report()
returns table (
  schema_name text,
  table_name text,
  rls_enabled boolean,
  rls_forced boolean,
  policy_count int,
  detected_owner_column text,
  detected_household_column text,
  needs_attention boolean
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with public_tables as (
    select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced, c.oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),
  cols as (
    select table_schema, table_name,
      max(case when column_name in ('user_id', 'owner_id', 'profile_id', 'created_by') then column_name end) as owner_col,
      max(case when column_name = 'household_id' then column_name end) as household_col
    from information_schema.columns
    where table_schema = 'public'
    group by table_schema, table_name
  ),
  policies as (
    select schemaname, tablename, count(*)::int as policy_count
    from pg_policies
    where schemaname = 'public'
    group by schemaname, tablename
  )
  select
    t.schema_name::text,
    t.table_name::text,
    t.rls_enabled,
    t.rls_forced,
    coalesce(p.policy_count, 0) as policy_count,
    coalesce(c.owner_col, case when t.table_name = 'profiles' then 'id' end)::text as detected_owner_column,
    c.household_col::text as detected_household_column,
    (t.rls_enabled is false or t.rls_forced is false or coalesce(p.policy_count, 0) = 0) as needs_attention
  from public_tables t
  left join cols c on c.table_schema = t.schema_name and c.table_name = t.table_name
  left join policies p on p.schemaname = t.schema_name and p.tablename = t.table_name
  order by needs_attention desc, t.table_name;
$$;

create or replace function security.loop_enable_rls_on_public_tables(apply_changes boolean default false)
returns table(table_name text, action text, applied boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  rec record;
begin
  for rec in
    select quote_ident(n.nspname) || '.' || quote_ident(c.relname) as fqtn, c.relname as relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  loop
    table_name := rec.relname;
    action := 'enable and force row level security';
    applied := apply_changes;
    if apply_changes then
      execute format('alter table %s enable row level security', rec.fqtn);
      execute format('alter table %s force row level security', rec.fqtn);
    end if;
    return next;
  end loop;
end;
$$;

create or replace function security.loop_rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        execute format('alter table if exists %s force row level security', cmd.object_identity);
        raise log 'Inside LOOP: auto-enabled and forced RLS on %', cmd.object_identity;
      exception when others then
        raise log 'Inside LOOP: failed to auto-enable RLS on %', cmd.object_identity;
      end;
    end if;
  end loop;
end;
$$;

drop event trigger if exists loop_ensure_rls;
create event trigger loop_ensure_rls
on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
execute function security.loop_rls_auto_enable();

create or replace function security.loop_column_exists(target_table text, target_column text)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = target_table and column_name = target_column
  );
$$;

create or replace function security.loop_create_owner_policies(apply_changes boolean default false)
returns table(table_name text, owner_column text, policy_type text, applied boolean, statement text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  rec record; col text; fqtn text; policy_name text; sql_text text;
begin
  for rec in
    select c.relname as relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and c.relname not in ('admin_audit_log','app_settings','beta_access_codes','beta_access_code_redemptions','account_deletion_requests')
  loop
    fqtn := 'public.' || quote_ident(rec.relname);
    col := null;

    if rec.relname = 'profiles' and security.loop_column_exists(rec.relname, 'id') then col := 'id';
    elsif security.loop_column_exists(rec.relname, 'user_id') then col := 'user_id';
    elsif security.loop_column_exists(rec.relname, 'owner_id') then col := 'owner_id';
    elsif security.loop_column_exists(rec.relname, 'profile_id') then col := 'profile_id';
    elsif security.loop_column_exists(rec.relname, 'created_by') then col := 'created_by';
    end if;

    if col is not null then
      policy_name := 'loop_owner_select';
      sql_text := format('create policy %I on %s for select to authenticated using ((select auth.uid()) is not null and %I = (select auth.uid()))', policy_name, fqtn, col);
      if apply_changes and not exists (select 1 from pg_policies where schemaname='public' and tablename=rec.relname and policyname=policy_name) then execute sql_text; end if;
      table_name := rec.relname; owner_column := col; policy_type := 'select'; applied := apply_changes; statement := sql_text; return next;

      policy_name := 'loop_owner_insert';
      sql_text := format('create policy %I on %s for insert to authenticated with check ((select auth.uid()) is not null and %I = (select auth.uid()))', policy_name, fqtn, col);
      if apply_changes and not exists (select 1 from pg_policies where schemaname='public' and tablename=rec.relname and policyname=policy_name) then execute sql_text; end if;
      table_name := rec.relname; owner_column := col; policy_type := 'insert'; applied := apply_changes; statement := sql_text; return next;

      policy_name := 'loop_owner_update';
      sql_text := format('create policy %I on %s for update to authenticated using ((select auth.uid()) is not null and %I = (select auth.uid())) with check ((select auth.uid()) is not null and %I = (select auth.uid()))', policy_name, fqtn, col, col);
      if apply_changes and not exists (select 1 from pg_policies where schemaname='public' and tablename=rec.relname and policyname=policy_name) then execute sql_text; end if;
      table_name := rec.relname; owner_column := col; policy_type := 'update'; applied := apply_changes; statement := sql_text; return next;

      policy_name := 'loop_owner_delete';
      sql_text := format('create policy %I on %s for delete to authenticated using ((select auth.uid()) is not null and %I = (select auth.uid()))', policy_name, fqtn, col);
      if apply_changes and not exists (select 1 from pg_policies where schemaname='public' and tablename=rec.relname and policyname=policy_name) then execute sql_text; end if;
      table_name := rec.relname; owner_column := col; policy_type := 'delete'; applied := apply_changes; statement := sql_text; return next;
    end if;
  end loop;
end;
$$;

create or replace function security.loop_create_household_policies(apply_changes boolean default false)
returns table(table_name text, policy_type text, applied boolean, statement text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  rec record; fqtn text; policy_name text; sql_text text;
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='household_members') then return; end if;

  for rec in
    select c.relname as relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col on col.table_schema = n.nspname and col.table_name = c.relname and col.column_name = 'household_id'
    where n.nspname = 'public' and c.relkind in ('r','p') and c.relname <> 'household_members'
  loop
    fqtn := 'public.' || quote_ident(rec.relname);
    policy_name := 'loop_household_select';
    sql_text := format($fmt$
      create policy %I on %s for select to authenticated
      using (
        (select auth.uid()) is not null
        and exists (
          select 1 from public.household_members hm
          where hm.household_id = %s.household_id
            and hm.user_id = (select auth.uid())
            and coalesce(hm.status, 'active') = 'active'
        )
      )
    $fmt$, policy_name, fqtn, quote_ident(rec.relname));

    if apply_changes and not exists (select 1 from pg_policies where schemaname='public' and tablename=rec.relname and policyname=policy_name) then execute sql_text; end if;
    table_name := rec.relname; policy_type := 'household_select'; applied := apply_changes; statement := sql_text; return next;
  end loop;
end;
$$;
