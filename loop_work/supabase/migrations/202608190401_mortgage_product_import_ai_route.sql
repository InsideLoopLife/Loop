insert into public.loop_ai_model_routes (
  route_key,
  display_name,
  task_kind,
  default_model,
  fallback_model,
  default_api_key_env,
  recommended_effort,
  notes,
  billing_scope
)
values (
  'mortgage_product_import',
  'Mortgage product quote import',
  'mortgage_product_import',
  'gpt-4.1-mini',
  'gpt-4.1-mini',
  'OPENAI_API_KEY',
  'normal',
  'Extract lender mortgage quote fields from a user-supplied product page or image. Never infer missing values.',
  'user_tier'
)
on conflict (route_key) do update set
  display_name = excluded.display_name,
  task_kind = excluded.task_kind,
  default_model = excluded.default_model,
  fallback_model = excluded.fallback_model,
  default_api_key_env = excluded.default_api_key_env,
  recommended_effort = excluded.recommended_effort,
  notes = excluded.notes,
  billing_scope = excluded.billing_scope,
  updated_at = now();

insert into public.loop_tier_ai_model_config (
  tier_key,
  route_key,
  provider,
  model,
  api_key_env_name,
  daily_limit,
  monthly_budget_pence,
  enabled,
  notes
)
values
  ('free', 'mortgage_product_import', 'openai', 'gpt-4.1-mini', 'OPENAI_API_KEY', 5, 50, true, 'Mortgage quote URL/image extraction'),
  ('plus', 'mortgage_product_import', 'openai', 'gpt-4.1-mini', 'OPENAI_API_KEY', 25, 250, true, 'Mortgage quote URL/image extraction'),
  ('pro', 'mortgage_product_import', 'openai', 'gpt-4.1-mini', 'OPENAI_API_KEY', 75, 750, true, 'Mortgage quote URL/image extraction'),
  ('premium', 'mortgage_product_import', 'openai', 'gpt-4.1-mini', 'OPENAI_API_KEY', 150, 1500, true, 'Mortgage quote URL/image extraction'),
  ('staff', 'mortgage_product_import', 'openai', 'gpt-4.1-mini', 'OPENAI_API_KEY', 1000, null, true, 'Mortgage quote URL/image extraction'),
  ('_system', 'mortgage_product_import', 'openai', 'gpt-4.1-mini', 'OPENAI_API_KEY', 1000, 10000, true, 'Mortgage quote URL/image extraction')
on conflict (tier_key, route_key) do update set
  provider = excluded.provider,
  model = excluded.model,
  api_key_env_name = excluded.api_key_env_name,
  daily_limit = excluded.daily_limit,
  monthly_budget_pence = excluded.monthly_budget_pence,
  enabled = excluded.enabled,
  notes = excluded.notes,
  updated_at = now();
