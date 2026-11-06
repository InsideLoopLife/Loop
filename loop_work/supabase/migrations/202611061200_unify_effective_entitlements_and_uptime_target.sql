-- Applied 2026-11-06.
-- loop_effective_user_entitlements read only the legacy loop_plan_features
-- table (6 keys) and loop_user_admin_profiles.current_plan, so features from
-- the August tier consolidation (mortgage_renewal_watch, savings_rate_watch)
-- were off for everyone and family-licence members were treated as free.
-- Same output shape; plan + feature flags now come from app_tier_plans /
-- app_tier_plan_features (family licences included); legacy-only keys kept;
-- per-user overrides still win. Signed-in users can only read their own.
create or replace function public.loop_effective_user_entitlements(p_user_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_legacy_plan text; v_plan text; v_legacy_tier text;
  v_legacy jsonb; v_tier jsonb; v_overrides jsonb;
begin
  if coalesce(auth.role(), '') = 'authenticated' and v_user is distinct from auth.uid() and not public.app_is_admin() then
    v_user := auth.uid();
  end if;
  select coalesce(current_plan, 'free') into v_legacy_plan from public.loop_user_admin_profiles where user_id = v_user;
  v_legacy_plan := coalesce(v_legacy_plan, 'free');
  v_plan := coalesce(public.app_resolve_entitlement_plan(v_user) ->> 'plan_slug', v_legacy_plan);
  v_legacy_tier := case v_plan when 'extra' then 'free' when 'staff' then 'admin_override' else v_plan end;
  select coalesce(jsonb_object_agg(f.feature_key, jsonb_build_object('enabled', f.enabled, 'limit_value', f.limit_value, 'limit_unit', f.limit_unit, 'feature_value', f.feature_value, 'source', 'tier', 'tier_key', f.tier_key)), '{}'::jsonb)
    into v_legacy from public.loop_plan_features f where f.tier_key = v_legacy_tier;
  select coalesce(jsonb_object_agg(pf.feature_key, jsonb_build_object('enabled', pf.enabled, 'limit_value', pf.limit_value, 'limit_period', pf.limit_period, 'source', 'tier_plan', 'tier_key', pf.plan_slug)), '{}'::jsonb)
    into v_tier from public.app_tier_plan_features pf where pf.plan_slug = v_plan;
  select coalesce(jsonb_object_agg(o.feature_key, jsonb_build_object('enabled', o.enabled, 'limit_value', o.limit_value, 'limit_unit', o.limit_unit, 'feature_value', o.override_value, 'source', 'user_override', 'reason', o.reason, 'expires_at', o.expires_at)), '{}'::jsonb)
    into v_overrides from public.loop_user_feature_overrides o where o.user_id = v_user and (o.expires_at is null or o.expires_at > now());
  return jsonb_build_object('user_id', v_user, 'plan', v_plan, 'features', v_legacy || v_tier || v_overrides);
end;
$function$;

-- First uptime target (the uptime cron previously had nothing to check).
insert into loop_uptime_targets (target_name, target_url, area, timeout_ms, check_frequency_minutes, notes)
select 'Loop web (sign-in page)', 'https://loop-web-jf7p.onrender.com/login', 'system_continuity', 30000, 720, 'Checked by /api/cron/uptime-checks from the rates worker maintenance run.'
where not exists (select 1 from loop_uptime_targets where target_url = 'https://loop-web-jf7p.onrender.com/login');
