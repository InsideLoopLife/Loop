-- v28.52 optional Supabase Security Advisor hardening for private beta.
-- Run after v28_52_beta_sql_constraint_repair.sql.
-- This addresses common warnings shown in Supabase Security Advisor without touching storage bucket policies.

-- 1) SECURITY DEFINER views: force invoker permissions/RLS where supported.
do $$
begin
  if to_regclass('public.stock_price_history') is not null then
    begin
      execute 'alter view public.stock_price_history set (security_invoker = true)';
    exception when others then
      raise notice 'Could not set security_invoker on public.stock_price_history: %', sqlerrm;
    end;
  end if;

  if to_regclass('public.loop_savings_deal_match_preview') is not null then
    begin
      execute 'alter view public.loop_savings_deal_match_preview set (security_invoker = true)';
    exception when others then
      raise notice 'Could not set security_invoker on public.loop_savings_deal_match_preview: %', sqlerrm;
    end;
  end if;
end $$;

-- 2) Function search_path warnings: pin search_path for public functions.
-- Keep legacy schemas in path so older unqualified references do not break during beta.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    begin
      execute format(
        'alter function %I.%I(%s) set search_path = public, extensions, auth, storage, pg_temp',
        r.schema_name,
        r.function_name,
        r.args
      );
    exception when others then
      raise notice 'Could not set search_path on %.%(%): %', r.schema_name, r.function_name, r.args, sqlerrm;
    end;
  end loop;
end $$;

-- 3) SECURITY DEFINER functions: remove unsigned/anon execute, keep signed-in users.
-- Admin checks inside the functions still decide who can actually do admin actions.
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    begin
      execute format('revoke execute on function %I.%I(%s) from public', r.schema_name, r.function_name, r.args);
      execute format('revoke execute on function %I.%I(%s) from anon', r.schema_name, r.function_name, r.args);
      execute format('grant execute on function %I.%I(%s) to authenticated', r.schema_name, r.function_name, r.args);
    exception when others then
      raise notice 'Could not harden execute grants on %.%(%): %', r.schema_name, r.function_name, r.args, sqlerrm;
    end;
  end loop;
end $$;

-- 4) Extension in public: move pg_trgm into extensions schema if present.
-- The function search_path above includes extensions so older queries still resolve it.
create schema if not exists extensions;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    begin
      execute 'alter extension pg_trgm set schema extensions';
    exception when others then
      raise notice 'Could not move pg_trgm extension to extensions schema: %', sqlerrm;
    end;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
