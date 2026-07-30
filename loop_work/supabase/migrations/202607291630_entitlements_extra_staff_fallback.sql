-- BUGFIX (tiering consolidation, follow-up): now that both live admin
-- write paths correctly write real plan_slugs ('extra', 'staff') into
-- loop_user_admin_profiles.current_plan, this RPC would otherwise return
-- ZERO features for anyone on those two plans, since loop_plan_features
-- only has rows for free/plus/pro/admin_override. Map the two uncovered
-- slugs to the closest existing tier_key: 'extra' -> 'free' (safe, never
-- over-grants), 'staff' -> 'admin_override' (matches its evident intent
-- as the internal/full-access tier). Everything else is unchanged.
--
-- Already applied directly to production. This file is the git-history
-- record.

create or replace function public.loop_effective_user_entitlements(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_plan text;
  v_feature_tier_key text;
  v_features jsonb;
  v_overrides jsonb;
begin
  select coalesce(current_plan, 'free')
  into v_plan
  from public.loop_user_admin_profiles
  where user_id = coalesce(p_user_id, auth.uid());

  v_plan := coalesce(v_plan, 'free');

  v_feature_tier_key := case v_plan
    when 'extra' then 'free'
    when 'staff' then 'admin_override'
    else v_plan
  end;

  select coalesce(jsonb_object_agg(
    f.feature_key,
    jsonb_build_object(
      'enabled', f.enabled,
      'limit_value', f.limit_value,
      'limit_unit', f.limit_unit,
      'feature_value', f.feature_value,
      'source', 'tier',
      'tier_key', f.tier_key
    )
  ), '{}'::jsonb)
  into v_features
  from public.loop_plan_features f
  where f.tier_key = v_feature_tier_key;

  select coalesce(jsonb_object_agg(
    o.feature_key,
    jsonb_build_object(
      'enabled', o.enabled,
      'limit_value', o.limit_value,
      'limit_unit', o.limit_unit,
      'feature_value', o.override_value,
      'source', 'user_override',
      'reason', o.reason,
      'expires_at', o.expires_at
    )
  ), '{}'::jsonb)
  into v_overrides
  from public.loop_user_feature_overrides o
  where o.user_id = coalesce(p_user_id, auth.uid())
    and (o.expires_at is null or o.expires_at > now());

  return jsonb_build_object(
    'user_id', coalesce(p_user_id, auth.uid()),
    'plan', v_plan,
    'features', coalesce(v_features, '{}'::jsonb) || coalesce(v_overrides, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.loop_effective_user_entitlements(uuid) to authenticated;
