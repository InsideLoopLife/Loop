# v27.83 — Tier editing, provider AI routing, per-user AI budgets, market coverage seeds and product admin coverage

## What changed

### Admin > Tiers
- Tier cards now have a cog/settings control beside the price.
- Tier title, description, monthly price, status and sort order can be edited from the card.
- Existing feature limits can be edited inline: enabled/off, numeric limit, unit, JSON condition metadata and description.
- New feature/condition limits can be added from each tier card.
- Free tier AI request seed is now intentionally conservative. The migration lowers `ai_daily_requests` to 5 where it was above 5.

### AI provider/model routing
- Added provider catalogue in `lib/ai/provider-catalog.ts`.
- Admin can choose OpenAI/GPT, Anthropic/Claude, Google/Gemini or manual review.
- The model dropdown changes based on the provider selected.
- The key field auto-suggests the correct environment variable name for the provider.
- Secrets are still not stored in Supabase; only env variable names are stored.

### User AI budget logic
- Added customer-facing AI route scope for:
  - `profile_insight`
  - `nutrition_recommendation`
  - `property_insight`
- Added `loop_ai_usage_events` for per-user request and estimated-cost tracking.
- Added `loop_check_ai_entitlement(user_id, tier_key, route_key)` to decide whether a user can make another request.
- Added `lib/ai/usage-budget.ts` helper functions to check and record usage from app code.

### System/admin AI lanes
- Runtime checks, security review, product enrichment, investment research and vision scans remain configurable but no longer need to be treated as customer tier-budgeted requests.
- These are stored with `_system` in the config table.

### Investment coverage
- Added persisted seed coverage for LSE, AIM, NASDAQ, NYSE and Vanguard UK fund prices.
- Investment coverage page now shows built-in expected coverage seeds if the DB has not returned persisted rows yet.
- Existing investment holdings can seed extra markets where exchanges/providers are detected.

### Product admin
- Replaced `loop_admin_products_list` so product quality tiles include both:
  - `loop_nutrition_cards`
  - `nutrition_ingredients`
- The product quality page now requests up to 5000 products.
- The product library RPC now uses the same unified product coverage so it does not stop at the two starter cards.

### Nutrition ingredients UI
- Removed the noisy “ingredient_url_import · used X time(s)” style label.
- Added a clean pill on the top-right of each card: Ingredient, Product, Barcode, AI seed, Open Food Facts, etc.
- Ingredient pills are orange/black as requested.

## SQL to run
Run this in Supabase after deploying:

```sql
-- db/v27_83_tier_models_markets_products.sql
```

## Files added
- `components/admin/TierAiConfigurator.tsx`
- `lib/ai/provider-catalog.ts`
- `lib/ai/usage-budget.ts`
- `db/v27_83_tier_models_markets_products.sql`
- `UPDATE_V27_83_TIER_MODELS_MARKETS_PRODUCTS.md`

## Files updated
- `app/admin/tiers/page.tsx`
- `app/admin/investment-coverage/page.tsx`
- `app/admin/products/quality/page.tsx`
- `app/nutrition/ingredients/page.tsx`
- `lib/ai/model-routing.ts`

## Validation
A TS/TSX transpile check passed for the changed TypeScript/TSX files. A full Next build was not run in this sandbox because project dependencies are not installed in `node_modules`.
