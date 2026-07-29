-- LOOP v28.01 - tier-gated provider integrations
-- Additive seed only. This keeps Admin > Tiers as the source of truth and does not overwrite existing tier-cell edits.

insert into public.app_tier_features(feature_key, category, name, description, is_active)
values
  ('provider_integrations', 'WEALTH', 'Provider integrations', 'Connect external providers such as SnapTrade where the user plan allows it.', true),
  ('snaptrade_realtime', 'WEALTH', 'SnapTrade / broker connection', 'Connect investment platforms through SnapTrade where the plan and provider status allow it.', true)
on conflict (feature_key) do update set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

insert into public.app_tier_plan_features(plan_slug, feature_key, enabled, limit_value, limit_period, enforcement_mode, health_status, user_message)
select p.slug,
       'provider_integrations',
       (p.slug in ('pro','realtime','enterprise')),
       null,
       'none',
       case when p.slug in ('pro','realtime','enterprise') then 'audit' else 'upgrade' end,
       'active',
       case when p.slug in ('pro','realtime','enterprise')
         then 'Provider integrations are available. Individual providers may still need connection and coverage checks.'
         else 'Provider integrations require a Pro/realtime-enabled tier.' end
from public.app_tier_plans p
on conflict (plan_slug, feature_key) do nothing;

insert into public.app_tier_plan_features(plan_slug, feature_key, enabled, limit_value, limit_period, enforcement_mode, health_status, user_message)
select p.slug,
       'snaptrade_realtime',
       (p.slug in ('pro','realtime','enterprise')),
       null,
       'none',
       case when p.slug in ('pro','realtime','enterprise') then 'audit' else 'upgrade' end,
       'active',
       case when p.slug in ('pro','realtime','enterprise')
         then 'SnapTrade broker connection is available. Realtime prices activate when the provider connection is healthy.'
         else 'SnapTrade/broker connection requires a realtime-enabled tier.' end
from public.app_tier_plans p
on conflict (plan_slug, feature_key) do nothing;
