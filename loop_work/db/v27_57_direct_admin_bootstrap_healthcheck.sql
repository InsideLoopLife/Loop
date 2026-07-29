-- v27.57 Admin bootstrap healthcheck
-- Optional SQL. The main fix is scripts/bootstrap-admin.mjs.

create or replace function public.app_v2757_admin_healthcheck()
returns table (
  check_name text,
  ok boolean,
  detail text
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    'profiles_table_exists'::text,
    to_regclass('public.profiles') is not null,
    'public.profiles exists'::text
  union all
  select
    'people_table_exists'::text,
    to_regclass('public.people') is not null,
    'public.people exists; script will attempt to link owner records if matching.'::text;
$$;

grant execute on function public.app_v2757_admin_healthcheck() to anon;
grant execute on function public.app_v2757_admin_healthcheck() to authenticated;
