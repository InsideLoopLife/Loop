# The real fix — verified against your live page this time

Last pass I fixed the *code I'd written*, which turned out to be sitting unused next to the actual page. This pass I found and fixed the actual component rendering what's in your screenshot: `components/mortgage/MortgagePlannerClient.tsx` (5,793 lines — not something I built, something that already existed and does this whole House screen, including the "SAVED COMPARISON" panel).

**These two files are whole-file replacements** (your usual `unzip -o` workflow) — only two small changes are actually in them, both listed below so you don't have to diff 5,793 lines to find them.

## Change 1 — `domains/wealth/house/HousePage.tsx`
One query, swapped from the raw table to the effective-allocation view:
```diff
- .from("home_mortgage_liability_allocations")
- .select("id, home_mortgage_deal_id, person_id, liability_percent")
+ .from("mortgage_liability_allocation_effective")
+ .select("id, home_mortgage_deal_id, person_id, liability_percent, source")
```

## Change 2 — `components/mortgage/MortgagePlannerClient.tsx`
- `HomeMortgageLiabilityAllocation` type gained an optional `source` field
- The liability label now appends `(assumed from ownership)` or `(assumed equal split)` when the split wasn't explicitly set by you — so it's honest about what's a real decision vs. a default

## What's live in Supabase (this pass)
`mortgage_liability_allocation_effective` was rebuilt to expose `id`, `household_id`, `user_id`, `visibility_scope` — needed because your household-visibility filter (`householdMemberDataOrFilter`) checks those columns on every table it queries, and the view didn't have them before. Also added `security_invoker = true`, which I'd missed originally — without it, a plain Postgres view runs with the *view owner's* privileges rather than the querying user's, which would have silently bypassed RLS. Worth knowing for any future views on this project.

**Confirmed against real data**, not assumed: queried the view directly against 8 Hydra Close's actual mortgage deal — `home_owners` already had Beth and Dan at 50/50, and the view correctly returns `source: 'ownership_share'` at 50% each. That's what will render once this ships.

## Verified
```
npx tsc --noEmit -> exit 0, zero errors, both files included
```

## What I'd do differently next time
Check the actual frontend before writing a single API route. The last two passes were built entirely from Supabase schema introspection with no visibility into what already existed in your app code — that's how a redundant `property_ownership_shares` table and a fully orphaned `components/house/` tree happened. Now that I know your repo's public and I can clone it, that's step one from here on, not a last resort after something breaks.
