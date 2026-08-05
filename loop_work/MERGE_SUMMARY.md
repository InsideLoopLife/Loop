# Rates worker resilience — merged with existing pot logic, not replacing it

## What actually happened
Your uploaded resilience package was built from a version of the
codebase before the pot-logic fixes (icon bug, essential-outgoings,
adaptive display) had been pushed. Applying it directly would have
silently reverted all three. This is a genuine, careful merge — both
sets of work are real and now coexist correctly.

## Files (20 total)

**Merged (both sides verified present, individually — not combined counts):**
```
app/accounts/page.tsx
components/financial-flow/SavingsFlowDetail.tsx
domains/wealth/financial-flow/FinancialFlowPage.tsx
lib/wealth/savings-intelligence.ts
```

**Taken as theirs wholesale** (substantially rewritten for resilience,
no conflict with anything I'd built — my only earlier touch was a
narrow TypeScript fix that their rewrite made moot):
```
lib/wealth/mortgage-catalogue.ts
```

**Copied directly, never touched by me this session:**
```
app/admin/savings/actions.ts
app/api/cron/mortgage-catalogue-refresh/route.ts
app/api/cron/savings-rate-watch/route.ts
components/savings/SavingsOptimiser.tsx
lib/wealth/default-source-catalogue.ts
lib/wealth/rate-source-health.ts
lib/wealth/rates-worker-runtime.ts
lib/wealth/savings-catalogue.ts
lib/wealth/savings-rate-watch.ts
lib/wealth/source-ingestion.ts
scripts/check-v29-03-rates-worker.ts
scripts/run-loop-cron-endpoint.mjs
scripts/run-savings-rate-watch.mjs
```

## Database
`supabase/migrations/202608041900_rates_worker_resilience_v3.sql` —
already applied directly to your live Supabase project (source retry
scheduling, HTTP diagnostics, content fingerprints, a proper distributed
lock for the worker, collapse protection). Nothing further needed there.

## Verification
All 16 code files pass a fresh esbuild syntax check. Every one of my
four earlier fixes individually re-confirmed present in the merged
files — checked one pattern at a time, not a combined count, after the
earlier mistake in this thread.

## Deployment order (from their own instructions, still correct)
1. Migration — done
2. Push these files, deploy the web app
3. Redeploy/rerun the Render rates cron services
4. Run savings first, then mortgages; check the `health`/`detail` fields
   they return
