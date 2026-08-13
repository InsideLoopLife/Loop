# House overview — build fix (verified against your real repo)

Your repo is public, so I cloned it directly, reproduced the exact Render failure locally, fixed it, and confirmed both `tsc --noEmit` and `npm run build` now pass — not guessed, actually run.

## Root causes (there were three, only one showed up in the Render log so far)
1. **`createClient()` wasn't awaited.** Your `lib/supabase/server.ts` re-exports an async `createServerDatabaseClient`. Every file I'd written called it synchronously. This was the exact Render error.
2. **Wrong table.** I built everything against `loop_household_properties`, which isn't what your real House page uses. The actual tables are `homes`, `home_owners`, `home_mortgage_deals`, `home_valuation_sources` — confirmed by reading `domains/wealth/house/HousePage.tsx` directly.
3. **`home_owners` already existed.** It's the exact ownership-percent table I built as `property_ownership_shares` last pass, without knowing yours was already there. Fixed in Supabase: the `mortgage_liability_allocation_effective` view now sources from `home_owners`, and `property_ownership_shares` has been dropped.
4. **Constraint violation waiting to happen.** `mortgage_deal_preferences.source_kind` only allows `'market'` or `'recommendation'` (real check constraint) — the shortlist endpoint was writing `'mortgage_rate_deal'`, which would have failed the moment someone used it.

## What changed
```
lib/house/overview-data.ts                     -- rewritten against homes/home_owners/home_mortgage_deals
app/api/house/overview/route.ts                 -- awaits createClient()
app/api/house/mortgage/deal-options/route.ts    -- awaits createClient() (the exact file in your build log)
app/api/house/mortgage/shortlist/route.ts       -- awaits createClient(), source_kind fixed to 'market'
components/house/HouseOverviewPage.tsx          -- homeId param instead of propertyId, drops fields that don't exist yet
components/house/StatStrip.tsx                  -- improvementsScore now optional (no condition-score data source exists yet)
components/house/GlimpseNavGrid.tsx             -- movingSearches now optional
```

Also now reuses your existing `calculateMonthlyMortgagePayment` from `lib/calculations/mortgage.ts` instead of the duplicate I'd written — one fewer place for the maths to drift.

## Verified, not assumed
```
npx tsc --noEmit    -> exit 0, zero errors
npm run build        -> compiles + typechecks clean; only remaining failure is
                         /account/money-strategy prerendering, which fails purely
                         because my sandbox has no Supabase env vars — unrelated
                         page, will not happen on Render with real credentials.
```

## Still open
- `MortgageBubble.tsx` and `FollowOnCard.tsx` weren't touched this pass — they only consume props, no table references, so they should be fine, but worth a visual check once this is live.
- `HouseOverviewPage.tsx` still isn't imported by `domains/wealth/house/HousePage.tsx` — this fix makes the code *correct*, not *wired in*. That's a separate decision: whether to fold these pieces into the existing 402-line `HousePage.tsx`, or keep them as a new route. Worth talking through before I touch that file, since it's the one actually serving traffic.
- I haven't looked at `lib/affordability/mortgage-market.ts` yet (the pre-existing affordability engine) — flagged last message, still unresolved.
