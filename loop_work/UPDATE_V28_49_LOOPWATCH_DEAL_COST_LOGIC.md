# v28.49 LoopWatch deal and household-cost logic

Adds the next layer on top of LoopWatch document extraction.

## What changed

- Confirmed LoopWatch cards now run a watch check.
- LoopWatch can create opportunity cards for:
  - renewal/end dates inside the action window,
  - insurance cover-review gaps,
  - mobile/broadband annual price-increase projections,
  - savings terms with better catalogue rates,
  - mortgage documents ready to link into mortgage watch,
  - Financial Flow cost sync.
- LoopWatch can push a confirmed contract/policy monthly cost into Financial Flow as a planned item.
- Mobile/broadband provider rules are admin-controlled through `/admin/loopwatch`.
- Added `/api/cron/loopwatch-daily` for scheduled checks.

## Important principle

Provider annual increase rules are not hard-coded as trusted facts. The migration seeds common provider placeholders as `needs_review`; admin should add/activate the current amount from the provider/source page.

## Deploy

1. Run `db/v28_49_loopwatch_deal_cost_logic.sql` in Supabase.
2. Apply the patch files.
3. Redeploy.
4. Optionally schedule `GET /api/cron/loopwatch-daily` with `Authorization: Bearer $CRON_SECRET`.

## New files

- `lib/loopwatch/watch-logic.ts`
- `app/api/cron/loopwatch-daily/route.ts`
- `app/admin/loopwatch/page.tsx`
- `app/admin/loopwatch/actions.ts`
- `db/v28_49_loopwatch_deal_cost_logic.sql`

## Updated files

- `app/loopwatch/page.tsx`
- `app/loopwatch/actions.ts`
- `lib/navigation/sections.ts`
