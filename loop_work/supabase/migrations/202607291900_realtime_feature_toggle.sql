-- Realtime market data access is now a real, per-tier feature toggle
-- (app_tier_plan_features.snaptrade_realtime) instead of a hardcoded
-- "staff only" special case baked into the fan-out RPC. Set to Pro and
-- Staff = enabled by default; change any plan's row in
-- app_tier_plan_features to adjust which tiers get it — no code change
-- needed after this.
--
-- Already applied directly to production. This file is the git-history
-- record.

update app_tier_plan_features
set enabled = true, updated_at = now()
where feature_key = 'snaptrade_realtime' and plan_slug = 'staff';

create or replace function public.app_admin_set_user_plan(
  p_user_id uuid,
  p_plan_slug text,
  p_reason text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_payment_tier text;
  v_market_data_tier text;
  v_realtime_enabled boolean;
  v_provider_status text;
  v_admin_email text;
  v_payment_rank int;
  v_market_rank int;
  v_existing_payment_tier text;
  v_existing_market_tier text;
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  if not exists (select 1 from public.app_tier_plans where slug = p_plan_slug) then
    raise exception 'Plan does not exist.';
  end if;

  insert into public.app_user_plan_memberships(
    user_id, plan_slug, status, source, manual_override, override_reason, expires_at, created_by
  )
  values (
    p_user_id, p_plan_slug, 'active', 'admin', true, p_reason, p_expires_at, auth.uid()
  )
  on conflict (user_id) do update set
    plan_slug = excluded.plan_slug,
    status = 'active',
    source = 'admin',
    manual_override = true,
    override_reason = excluded.override_reason,
    expires_at = excluded.expires_at,
    created_by = excluded.created_by,
    updated_at = now();

  insert into public.app_user_investment_chart_preferences(user_id)
  values (p_user_id)
  on conflict (user_id) do update set
    restore_legacy_charts_on_downgrade = true,
    updated_at = now();

  v_payment_tier := case p_plan_slug
    when 'free' then 'free'
    when 'extra' then 'starter'
    when 'plus' then 'plus'
    when 'pro' then 'pro'
    when 'staff' then 'realtime'
    else 'free'
  end;

  select coalesce(enabled, false) into v_realtime_enabled
  from public.app_tier_plan_features
  where plan_slug = p_plan_slug and feature_key = 'snaptrade_realtime';
  v_realtime_enabled := coalesce(v_realtime_enabled, false);

  v_market_data_tier := case
    when v_realtime_enabled then 'realtime'
    when p_plan_slug = 'pro' then 'enhanced_delayed'
    else 'delayed'
  end;
  v_provider_status := case when v_realtime_enabled then 'connected' else 'not_configured' end;

  select email into v_admin_email from auth.users where id = auth.uid();

  select payment_tier, market_data_tier into v_existing_payment_tier, v_existing_market_tier
  from public.app_user_profiles where user_id = p_user_id;

  v_payment_rank := case coalesce(v_existing_payment_tier, 'free')
    when 'free' then 0 when 'starter' then 1 when 'plus' then 2
    when 'pro' then 3 when 'realtime' then 4 when 'enterprise' then 5 else 0 end;
  if (case v_payment_tier
        when 'free' then 0 when 'starter' then 1 when 'plus' then 2
        when 'pro' then 3 when 'realtime' then 4 when 'enterprise' then 5 else 0 end) < v_payment_rank
  then
    v_payment_tier := v_existing_payment_tier;
  end if;

  v_market_rank := case coalesce(v_existing_market_tier, 'manual')
    when 'manual' then 0 when 'delayed' then 1 when 'enhanced_delayed' then 2 when 'realtime' then 3 else 0 end;
  if (case v_market_data_tier
        when 'manual' then 0 when 'delayed' then 1 when 'enhanced_delayed' then 2 when 'realtime' then 3 else 0 end) < v_market_rank
  then
    v_market_data_tier := v_existing_market_tier;
  end if;

  insert into public.app_user_profiles(
    user_id, payment_tier, payment_tier_status, market_data_tier,
    market_data_provider_status, market_data_realtime_enabled,
    tier_checked_at, tier_check_note, updated_at
  )
  values (
    p_user_id, v_payment_tier, 'active', v_market_data_tier,
    v_provider_status, v_realtime_enabled,
    now(), format('Synced from plan assignment (%s) by %s', p_plan_slug, coalesce(v_admin_email, auth.uid()::text)), now()
  )
  on conflict (user_id) do update set
    payment_tier = excluded.payment_tier,
    payment_tier_status = excluded.payment_tier_status,
    market_data_tier = excluded.market_data_tier,
    market_data_provider_status = case
      when excluded.market_data_provider_status = 'connected' then excluded.market_data_provider_status
      else app_user_profiles.market_data_provider_status
    end,
    market_data_realtime_enabled = case
      when excluded.market_data_realtime_enabled = true then true
      else app_user_profiles.market_data_realtime_enabled
    end,
    tier_checked_at = excluded.tier_checked_at,
    tier_check_note = excluded.tier_check_note,
    updated_at = excluded.updated_at;

  insert into public.loop_user_admin_profiles(user_id, current_plan, realtime_market_data_enabled, updated_at)
  values (p_user_id, p_plan_slug, v_realtime_enabled, now())
  on conflict (user_id) do update set
    current_plan = excluded.current_plan,
    realtime_market_data_enabled = case
      when excluded.realtime_market_data_enabled = true then true
      else loop_user_admin_profiles.realtime_market_data_enabled
    end,
    updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'plan_slug', p_plan_slug);
end;
$$;

grant execute on function public.app_admin_set_user_plan(uuid, text, text, timestamptz) to authenticated;
