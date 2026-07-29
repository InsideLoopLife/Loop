# What's new in this drop (pension fee/ISIN cron)

This zip is your full project folder — replace the contents of your GitHub
repo's app folder (the one with package.json, lib/, app/, scripts/, db/ in it)
with this. Everything else is unchanged from your local copy; only these are
new/edited:

- `cron-fees.ts` (root of this folder) — daily job entry point. Runs ISIN
  backfill then fee verification, independently (one failing doesn't stop
  the other), exits 0/1 for Render to track success/failure.
- `lib/investments/pension-fee-refresher.ts` — new file. Exports
  `runStaleFeeVerification` and `backfillMissingIsins`. Fee changes are
  bounds-checked (0-3%, max ~50%/0.15pp jump from stored value) before being
  applied and cascaded to `pension_funds`; every attempt (applied or not) is
  logged to `provider_fund_fee_change_log`. Throttled 500ms between funds.
- `package.json` — added `openai` and `dotenv` dependencies (already
  imported in code but missing from the manifest) and a `cron:fees` script.
- `render.cron-only.yaml` — added a `loop-pension-fee-and-isin-refresh` cron
  block (`npm run cron:fees`, daily at 2am).
- `db/v28_99_provider_fund_glossary_create.sql` — the CREATE TABLE script you
  already ran directly in Supabase, saved here for migration history.
- `db/v28_99b_provider_fund_glossary_patch.sql` — the follow-up patch you've
  also already run (adds `unit_price`, `unit_price_quote_unit`, `notes`,
  `last_isin_check_at`, the unique constraint needed for upserts, RLS, and
  the `provider_fund_fee_change_log` audit table).

## Still to do after pushing this

1. `npm install` (picks up `openai`/`dotenv`).
2. In the Render dashboard, create the Cron Job for
   `loop-pension-fee-and-isin-refresh` (or apply `render.cron-only.yaml` if
   you use Render's Blueprint/IaC sync) and set the four env vars:
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or
   `SUPABASE_SERVICE_ROLE_KEY`), `OPENAI_API_KEY`.
3. Test locally first: `npm run cron:fees` with `.env.local` populated.
4. No live "closing price" fetch exists yet anywhere in the app — this cron
   only covers fees and ISINs. That's still open if it's in scope.
5. Frontend loading/error states for the instant-fetch search route (Task A
   from your original brief) aren't part of this drop.
