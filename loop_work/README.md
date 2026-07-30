# Everything from the tiering/entitlements work — one package for one git update

Every code file changed across the whole tiering-consolidation thread,
gathered into one place, latest version of each. Copy each to the
matching path in `loop_work/`, overwrite where one already exists.

## Files to add/replace (17 total)

```
lib/navigation/sections.ts
domains/identity/account/AccountPage.tsx
app/admin/actions.ts
lib/ai/route-budget.ts
lib/investments/actions.ts
app/api/investments/fund-research/route.ts
app/api/investments/provider-fund-search/route.ts
app/api/affordability/coach/route.ts
app/api/mortgage/rate-research/route.ts
app/api/spending/bill-brand-preview/route.ts
app/api/help/route.ts
app/api/nutrition/recipe-import/route.ts
app/api/nutrition/product-lookup/route.ts
app/api/nutrition/image-suggest/route.ts
app/api/nutrition/label-image/route.ts
app/api/nutrition/menu-import/route.ts
app/api/nutrition/recipe-estimate/route.ts
```

All 17 pass an esbuild syntax check, run fresh just before this package
was assembled — not carried over from earlier checks.

## Database migrations (record only — all already applied live)

None of these need running. Your production database already has every
one of these changes. They're included purely so your git history
matches what's actually deployed, in case you ever need to rebuild from
scratch or check what happened when.

```
202607291600_tier_consolidation_fanout.sql          — plan-assignment fan-out to all 3 tier tables
202607291630_entitlements_extra_staff_fallback.sql   — fixed a gap my own fan-out fix created
202607291645_tier_consolidation_backfill.sql         — one-time fix for accounts that drifted before today
202607291700_tier_manual_refresh_rate_limit.sql      — new: tier-based caps on manual price refreshes
202607291800_ai_tier_coverage_gaps.sql               — fixed 2 more gaps found while wiring the last 10 AI routes
202607291900_realtime_feature_toggle.sql             — realtime access is now a real per-tier feature toggle
```

## What this whole body of work actually did, in one paragraph

Traced and fixed a genuine mess of 5 disconnected tier/plan systems down
to one consistent, verified-working whole: plan assignment now
propagates correctly everywhere from either live admin page; all AI
routes (12 of them) and manual stock-price refreshes are now actually
capped per-tier with a real midnight-UTC reset, not just data sitting
unused; and realtime market data access is a genuine admin-adjustable
feature toggle rather than a hardcoded rule. Full detail, including every
gap found and how each was fixed, is in `TIERING_SOURCE_OF_TRUTH.md`,
`CHANGES_AI_AND_REFRESH_ENFORCEMENT.md`, and
`CHANGES_REMAINING_AI_ROUTES.md` from earlier in this thread if you want
the complete story rather than just the file list.
