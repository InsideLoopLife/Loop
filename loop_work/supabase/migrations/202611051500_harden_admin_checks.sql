-- Applied 2026-11-05.
-- 1) user_metadata is user-writable, so it must never grant admin. Recognise the
--    real admin list via app_is_platform_admin() instead.
create or replace function public.loop_is_platform_admin()
returns boolean language sql stable set search_path to 'public', 'pg_catalog'
as $function$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
    or public.app_is_platform_admin();
$function$;

-- 2) Seven admin RPCs had no admin check. Each original was renamed to
--    <name>__unguarded (EXECUTE revoked from users) and replaced by a wrapper
--    that requires service_role or public.app_is_admin().
do $do$
declare fn text; r record; call_args text;
begin
  foreach fn in array array[
    'loop_admin_ai_usage_summary','loop_admin_attention_summary','loop_admin_investment_price_point_usage',
    'loop_admin_investment_snapshot_usage','loop_admin_navigation','loop_admin_product_imports_list','loop_admin_products_list'
  ] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = fn || '__unguarded') then continue; end if;
    select p.oid, p.pronargs, pg_get_function_arguments(p.oid) as args, pg_get_function_identity_arguments(p.oid) as ident,
           pg_get_function_result(p.oid) as res, p.proargnames as names
      into r from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn;
    if not found then continue; end if;
    execute format('alter function public.%I(%s) rename to %I', fn, r.ident, fn || '__unguarded');
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', fn || '__unguarded', r.ident);
    select coalesce(string_agg(quote_ident(a), ', ' order by i), '') into call_args
      from unnest(coalesce(r.names, array[]::text[])) with ordinality as t(a, i) where i <= r.pronargs;
    execute format(
      'create function public.%I(%s) returns %s language plpgsql stable security definer set search_path = public, pg_temp as %L',
      fn, r.args, r.res,
      format('begin
        if not (coalesce(auth.role(), '''') = ''service_role'' or public.app_is_admin()) then
          raise exception ''admin only'' using errcode = ''42501'';
        end if;
        return query select * from public.%I(%s);
      end;', fn || '__unguarded', call_args));
    execute format('revoke all on function public.%I(%s) from public, anon', fn, r.ident);
    execute format('grant execute on function public.%I(%s) to authenticated, service_role', fn, r.ident);
  end loop;
end $do$;
