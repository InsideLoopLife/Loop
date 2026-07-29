# UPDATE V27.83.1 — SQL hotfix and API key placement

## Fix

The v27.83 migration previously assumed `investment_holdings.provider_name` existed when detecting covered markets. Some installs only have `exchange`, so the dynamic SQL failed with:

`column "provider_name" does not exist`

The migration has been updated to build the market detection expression only from columns that actually exist on `public.investment_holdings`.

## What to run

If v27.83 already failed part-way through, run:

`db/v27_83_1_market_detection_hotfix.sql`

This runs the fixed market detection block and then continues with the remaining product admin functions that did not run after the failure.

If you have not run v27.83 yet, you can instead run the corrected full file:

`db/v27_83_tier_models_markets_products.sql`

Both are idempotent and safe to run more than once.

## API keys

The Admin > Tiers screen stores the environment variable name to use for a provider/model route. It does not store the secret API key value.

Put actual key values in server-side environment variables:

- Local development: `.env.local` in the app root
- Vercel: Project Settings > Environment Variables
- Render: Service > Environment
- Supabase Edge Functions only: Supabase Project Settings > Edge Functions > Secrets

Never put OpenAI/Claude/Gemini keys in a `NEXT_PUBLIC_` variable.

Recommended variable names:

- `OPENAI_API_KEY`
- `OPENAI_SECURITY_API_KEY`
- `OPENAI_PREMIUM_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_AI_API_KEY`

`.env.example` has been updated with these placeholders.
