-- Two real gaps found and fixed while wiring up AI budget enforcement
-- across the remaining 10 routes. Both already applied directly to
-- production. This file is the git-history record.

-- Gap 1: vision_label_scan had ONLY a "_system" config row — no
-- free/plus/pro/staff coverage at all. Wiring real enforcement onto
-- nutrition/label-image without this would have completely blocked
-- label-image scanning for every real user (the RPC's fallback-to-'free'
-- would also have failed to find a match). Added with similar
-- generosity to product_enrichment, a comparably-scoped vision/lookup
-- feature.
insert into loop_tier_ai_model_config (tier_key, route_key, enabled, daily_limit, monthly_budget_pence, provider, model)
values
  ('free', 'vision_label_scan', true, 15, 150, 'openai', 'gpt-4.1-mini'),
  ('plus', 'vision_label_scan', true, 50, 500, 'openai', 'gpt-4.1-mini'),
  ('pro', 'vision_label_scan', true, 150, 1500, 'openai', 'gpt-4.1-mini'),
  ('staff', 'vision_label_scan', true, 1000, null, 'openai', 'gpt-4.1-mini')
on conflict (tier_key, route_key) do nothing;

-- Gap 2: investment_research, product_enrichment and quick_runtime all
-- had free/premium/staff config but no plus/pro rows — meaning paying
-- Plus/Pro customers would have silently fallen back to free-tier
-- limits on these specific routes once enforcement went live (not a
-- hard block like gap 1, but under-serving paying tiers). Interpolated
-- sensibly between each route's existing free and premium values.
insert into loop_tier_ai_model_config (tier_key, route_key, enabled, daily_limit, monthly_budget_pence, provider, model) values
  ('plus', 'investment_research', true, 60, 1500, 'openai', 'gpt-4.1-mini'),
  ('pro', 'investment_research', true, 150, 3500, 'openai', 'gpt-4.1'),
  ('plus', 'product_enrichment', true, 250, 1500, 'openai', 'gpt-4.1-mini'),
  ('pro', 'product_enrichment', true, 600, 3000, 'openai', 'gpt-4.1-mini'),
  ('staff', 'product_enrichment', true, 2000, null, 'openai', 'gpt-4.1-mini'),
  ('plus', 'quick_runtime', true, 100, 500, 'openai', 'gpt-4.1-mini'),
  ('pro', 'quick_runtime', true, 250, 1200, 'openai', 'gpt-4.1-mini')
on conflict (tier_key, route_key) do nothing;
