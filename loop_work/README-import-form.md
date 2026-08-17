# Import-from-URL form — real UI, in the real live file

Both files whole-file replacements, `unzip -o`.

## What changed
- `components/mortgage/MortgagePlannerClient.tsx` — new `ImportProductUrlForm` component, rendered at the top of the existing "Sourced deals for you" section (Mortgage Deals tab). Paste a URL, see extracted rate/LTV/term + fit against your own mortgage, one button to shortlist it — reuses the exact same `toggleShortlist` function and `mortgage_deal_preferences` mechanism as every other deal on this page, just widened to accept `source_kind: "user_submitted"`.
- `app/api/house/mortgage/import-product-url/route.ts` — small fix: now takes `homeId` directly instead of trying to resolve a home from `householdId` (the household ID wasn't reliably available on the client's `Home` type, and `homeId` is simpler and unambiguous since the deals panel always has the specific home in scope already).

## A mistake caught before it shipped
First pass at inserting the new component accidentally deleted the `function MortgageDealsPanel({` declaration line it was inserted before — a `str_replace` that matched the line but didn't put it back. `tsc` caught it immediately (exit code 2, syntax errors at the exact spot) before I packaged anything. Fixed, re-verified, exit 0. Saying this because catching it is the point of running these checks every time rather than trusting a diff looks right.

## Verified
```
npx tsc --noEmit -> exit 0
npm run build      -> compiles clean, same one unrelated env-var failure
                       as every previous check
```

## What it looks like in use
1. User pastes a lender's specific product page URL into the new violet card at the top of "Sourced deals for you"
2. Hits "Import & assess fit" — calls the route from last message
3. Sees lender/product/rate/LTV/term, plus a plain-English fit line: current LTV vs required, current payment vs estimated new payment
4. "Shortlist this" button — same shortlist mechanism as any other deal, shows up wherever shortlisted deals already show up on this page (including the House overview follow-on bubble)
5. Small note at the bottom disclosing whether AI or the regex fallback did the extraction, so it's clear when to double-check
