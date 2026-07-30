-- Tiering consolidation: make app_admin_set_user_plan the single front
-- door for setting a user's tier, and have it fan out consistent values
-- to the other tables the app actually reads from, instead of requiring
-- an admin to separately visit three different pages to keep everything
-- in sync (which is how they drifted apart in the first place).
--
-- This does NOT change how any read-side function works — investments'
-- investmentDataEntitlementForProfile(), loop_effective_user_entitlements(),
-- and app_get_my_plan() are all untouched. It only changes what gets
-- written when an admin uses /admin/tiers or /admin/tier-control to set
-- a user's plan, so that write now updates:
--   1. app_user_plan_memberships   (unchanged — already worked)
--   2. app_user_profiles           (payment_tier/market_data_tier — drives investments/SnapTrade)
--   3. loop_user_admin_profiles    (current_plan — drives the landing page/briefing/2 API routes)
--
-- Mapping from a System #2 plan_slug to System #1's payment_tier /
-- market_data_tier. This is a best-effort, directionally-correct mapping,
-- not a byte-for-byte migration of every historical value — an admin can
-- still fine-tune market_data_provider_status/realtime_enabled by hand
-- afterward for edge cases (e.g. a user mid-way through connecting a
-- provider) via the existing /admin overview page, which is left in
-- place deliberately for that reason.

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

  -- Do not permanently destroy old charts. Pairing view logic should consult tier + this preference.
  insert into public.app_user_investment_chart_preferences(user_id)
  values (p_user_id)
  on conflict (user_id) do update set
    restore_legacy_charts_on_downgrade = true,
    updated_at = now();

  -- ---- Fan-out: keep System #1 (investments/SnapTrade) in step ----
  v_payment_tier := case p_plan_slug
    when 'free' then 'free'
    when 'extra' then 'starter'
    when 'plus' then 'plus'
    when 'pro' then 'pro'
    when 'staff' then 'enterprise'
    else 'free'
  end;
  v_market_data_tier := case p_plan_slug
    when 'staff' then 'realtime'
    when 'pro' then 'enhanced_delayed'
    else 'delayed'
  end;
  v_realtime_enabled := (p_plan_slug = 'staff');
  v_provider_status := case when p_plan_slug = 'staff' then 'connected' else 'not_configured' end;

  select email into v_admin_email from auth.users where id = auth.uid();

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
    -- Only relax provider_status/realtime downward with the tier change;
    -- never silently disconnect a provider a user already has connected
    -- just because their plan slug changed, and never silently mark one
    -- as connected either — that stays a manual, deliberate action.
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

  -- ---- Fan-out: keep Systems #4/#5 (landing page, briefing, 2 API routes) in step ----
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
