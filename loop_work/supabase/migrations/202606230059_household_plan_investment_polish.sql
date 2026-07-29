-- v27.59 Inside LOOP household/account/investment polish
-- Run after v27.58 tier control centre. This is additive and safe.

create extension if not exists pgcrypto;

create or replace function public.app_get_plan_comparison()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if to_regclass('public.app_tier_plans') is null
     or to_regclass('public.app_tier_features') is null
     or to_regclass('public.app_tier_plan_features') is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(plan_row order by (plan_row->>'sort_order')::int), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'slug', p.slug,
      'name', p.name,
      'description', p.description,
      'is_active', p.is_active,
      'visible_to_users', p.visible_to_users,
      'is_paid', p.is_paid,
      'monthly_price_pence', p.monthly_price_pence,
      'annual_price_pence', p.annual_price_pence,
      'currency', p.currency,
      'sort_order', p.sort_order,
      'badge', p.badge,
      'features', coalesce((
        select jsonb_agg(jsonb_build_object(
          'feature_key', f.feature_key,
          'category', f.category,
          'name', f.name,
          'description', f.description,
          'enabled', pf.enabled,
          'limit_value', pf.limit_value,
          'limit_period', pf.limit_period,
          'health_status', pf.health_status,
          'enforcement_mode', pf.enforcement_mode,
          'user_message', pf.user_message
        ) order by f.category, f.name)
        from public.app_tier_plan_features pf
        join public.app_tier_features f on f.feature_key = pf.feature_key
        where pf.plan_slug = p.slug
      ), '[]'::jsonb)
    ) as plan_row
    from public.app_tier_plans p
    where p.is_active = true
      and p.visible_to_users = true
  ) x;

  return v_result;
end;
$$;

grant execute on function public.app_get_plan_comparison() to authenticated;

-- Investment tier explanation helper. Keeps UI copy database-driven enough for beta.
create or replace function public.app_get_investment_tier_explainer()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_plan jsonb;
  v_features jsonb;
begin
  if to_regclass('public.app_user_plan_memberships') is null then
    return jsonb_build_object(
      'plan_slug', 'free',
      'title', 'Free investment lookup',
      'summary', 'Manual/on-demand delayed lookup for stocks, ETFs and common funds.',
      'upgrade_path', '/account?tab=plan'
    );
  end if;

  select to_jsonb(m.*) into v_plan
  from public.app_user_plan_memberships m
  where m.user_id = auth.uid()
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'feature_key', pf.feature_key,
    'enabled', pf.enabled,
    'limit_value', pf.limit_value,
    'limit_period', pf.limit_period,
    'health_status', pf.health_status,
    'user_message', pf.user_message
  )), '[]'::jsonb)
  into v_features
  from public.app_tier_plan_features pf
  where pf.plan_slug = coalesce(v_plan->>'plan_slug', 'free')
    and pf.feature_key in ('investment_lookup','market_data_realtime','snaptrade');

  return jsonb_build_object(
    'plan_slug', coalesce(v_plan->>'plan_slug', 'free'),
    'title', initcap(coalesce(v_plan->>'plan_slug', 'free')) || ' investment access',
    'summary', 'This explains what investment data is available on your current tier.',
    'features', v_features,
    'upgrade_path', '/account?tab=plan'
  );
end;
$$;

grant execute on function public.app_get_investment_tier_explainer() to authenticated;

create or replace function public.app_v2759_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'plan_comparison_rpc'::text, exists(select 1 from pg_proc where proname = 'app_get_plan_comparison'), 'Plan comparison RPC exists.'::text
  union all
  select 'investment_explainer_rpc'::text, exists(select 1 from pg_proc where proname = 'app_get_investment_tier_explainer'), 'Investment tier explainer RPC exists.'::text
  union all
  select 'tier_tables_available'::text,
    to_regclass('public.app_tier_plans') is not null
    and to_regclass('public.app_tier_plan_features') is not null,
    'Tier tables exist from v27.58.'::text;
$$;

grant execute on function public.app_v2759_healthcheck() to anon;
grant execute on function public.app_v2759_healthcheck() to authenticated;
