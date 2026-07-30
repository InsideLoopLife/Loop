-- One-time backfill: fix accounts that drifted before the fan-out fix
-- existed. Uses the exact same upgrade-only mapping as
-- app_admin_set_user_plan() — never lowers anyone's existing access,
-- only raises loop_user_admin_profiles.current_plan (and app_user_profiles)
-- to match their real app_user_plan_memberships row where that's higher
-- than what they currently show.
--
-- Already applied directly to production (fixed one real drift case out
-- of 4 total users at the time). This file is the git-history record —
-- it's a one-time DO block, not a reusable function. Safe to re-run if
-- needed (it's still upgrade-only and idempotent), but won't do anything
-- for users who are already in sync.

do $$
declare
  r record;
  v_mapped_payment_tier text;
  v_mapped_market_tier text;
  v_realtime boolean;
  v_provider_status text;
  v_final_payment_tier text;
  v_final_market_tier text;
  v_existing_payment_tier text;
  v_existing_market_tier text;
  v_existing_current_plan text;
  v_final_current_plan text;
  PAYMENT_RANK jsonb := '{"free":0,"starter":1,"plus":2,"pro":3,"realtime":4,"enterprise":5}'::jsonb;
  MARKET_RANK jsonb := '{"manual":0,"delayed":1,"enhanced_delayed":2,"realtime":3}'::jsonb;
  PLAN_RANK jsonb := '{"free":0,"extra":1,"plus":2,"pro":3,"staff":4}'::jsonb;
begin
  for r in select user_id, plan_slug from public.app_user_plan_memberships loop
    v_mapped_payment_tier := case r.plan_slug
      when 'free' then 'free' when 'extra' then 'starter' when 'plus' then 'plus'
      when 'pro' then 'pro' when 'staff' then 'realtime' else 'free' end;
    v_mapped_market_tier := case r.plan_slug
      when 'staff' then 'realtime' when 'pro' then 'enhanced_delayed' else 'delayed' end;
    v_realtime := (r.plan_slug = 'staff');
    v_provider_status := case when r.plan_slug = 'staff' then 'connected' else 'not_configured' end;

    select payment_tier, market_data_tier into v_existing_payment_tier, v_existing_market_tier
    from public.app_user_profiles where user_id = r.user_id;

    v_final_payment_tier := case
      when coalesce((PAYMENT_RANK->>coalesce(v_existing_payment_tier,'free'))::int,0)
         > coalesce((PAYMENT_RANK->>v_mapped_payment_tier)::int,0)
      then v_existing_payment_tier else v_mapped_payment_tier end;
    v_final_market_tier := case
      when coalesce((MARKET_RANK->>coalesce(v_existing_market_tier,'manual'))::int,0)
         > coalesce((MARKET_RANK->>v_mapped_market_tier)::int,0)
      then v_existing_market_tier else v_mapped_market_tier end;

    insert into public.app_user_profiles(user_id, payment_tier, payment_tier_status, market_data_tier, market_data_provider_status, market_data_realtime_enabled, tier_checked_at, tier_check_note, updated_at)
    values (r.user_id, v_final_payment_tier, 'active', v_final_market_tier, v_provider_status, v_realtime, now(), 'Backfilled from existing plan membership (tiering consolidation)', now())
    on conflict (user_id) do update set
      payment_tier = excluded.payment_tier,
      payment_tier_status = excluded.payment_tier_status,
      market_data_tier = excluded.market_data_tier,
      market_data_provider_status = case when excluded.market_data_provider_status = 'connected' then excluded.market_data_provider_status else app_user_profiles.market_data_provider_status end,
      market_data_realtime_enabled = case when excluded.market_data_realtime_enabled = true then true else app_user_profiles.market_data_realtime_enabled end,
      tier_checked_at = excluded.tier_checked_at,
      tier_check_note = excluded.tier_check_note,
      updated_at = excluded.updated_at;

    select current_plan into v_existing_current_plan from public.loop_user_admin_profiles where user_id = r.user_id;
    v_final_current_plan := case
      when coalesce((PLAN_RANK->>coalesce(v_existing_current_plan,'free'))::int,0)
         > coalesce((PLAN_RANK->>r.plan_slug)::int,0)
      then v_existing_current_plan else r.plan_slug end;

    insert into public.loop_user_admin_profiles(user_id, current_plan, realtime_market_data_enabled, updated_at)
    values (r.user_id, v_final_current_plan, v_realtime, now())
    on conflict (user_id) do update set
      current_plan = excluded.current_plan,
      realtime_market_data_enabled = case when excluded.realtime_market_data_enabled = true then true else loop_user_admin_profiles.realtime_market_data_enabled end,
      updated_at = excluded.updated_at;
  end loop;
end $$;
