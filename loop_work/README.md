# Minimal push — pension fee/ISIN cron only

You're still local, so this is just the 6 files that are new or changed for
this feature — not your whole app. Everything else stays as-is in GitHub.

## Where each file goes (relative to your project folder — the one with
## package.json, lib/, app/, scripts/ already in it)

```
cron-fees.ts                                     -> project root (next to package.json)
lib/investments/pension-fee-refresher.ts         -> new file
package.json                                     -> replaces yours (only openai, dotenv,
                                                     and a cron:fees script were added —
                                                     nothing else in it was touched)
render.cron-only.yaml                            -> replaces yours (your existing cron
                                                     blocks are untouched, one new block added)
db/v28_99_provider_fund_glossary_create.sql      -> new file (history only — you already ran this)
db/v28_99b_provider_fund_glossary_patch.sql      -> new file (history only — you already ran this)
```

The two `db/*.sql` files aren't required for anything to *run* — you already
executed both against Supabase directly. They're here purely so the repo has
a record of how the table reached its current shape, for whenever this does
get pushed for real.

## To get this working locally right now

1. Drop these 6 files into place as above.
2. `npm install` (picks up `openai` and `dotenv`).
3. Add to `.env.local`: `OPENAI_API_KEY=...` (Supabase URL/service key you
   should already have set for the rest of the app).
4. Run it: `npm run cron:fees`
   - First run against an empty/sparse `provider_fund_glossary` will mostly
     log "nothing to backfill" / "all fees up to date" — that's expected.
5. When you're ready to actually commit: `git add cron-fees.ts lib/investments/pension-fee-refresher.ts package.json render.cron-only.yaml db/v28_99_provider_fund_glossary_create.sql db/v28_99b_provider_fund_glossary_patch.sql`
   then commit and push.

## Not needed yet (until you deploy)

`render.cron-only.yaml` and the actual Render Cron Job setup only matter once
you're ready to schedule this on a server — no need to touch Render while
you're still testing locally.
