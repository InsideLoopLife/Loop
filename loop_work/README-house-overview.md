# House overview — real implementation

Turns the mockup into wired-up code. This talks to your actual tables, not sample data.

## Live in Supabase already (from the previous message)
- `property_ownership_shares` + `mortgage_liability_allocation_effective` view — confirmed working against real data

## New files
```
lib/mortgage/payment-math.ts              -- shared amortization, used by follow-on calc
lib/house/overview-data.ts                -- builds the whole page payload in one query set
app/api/house/overview/route.ts           -- GET, single call for the screen
app/api/house/mortgage/deal-options/route.ts   -- GET, candidate deals for the shortlist picker
app/api/house/mortgage/shortlist/route.ts      -- POST, writes to mortgage_deal_preferences
components/house/InfoTooltip.tsx
components/house/StatStrip.tsx
components/house/MortgageBubble.tsx       -- includes the liability split line
components/house/FollowOnCard.tsx         -- real picker, optimistic in-place update, no reload
components/house/GlimpseNavGrid.tsx       -- includes the new Overpayments card
components/house/HouseOverviewPage.tsx    -- composes everything
```

## What's real vs. what I flagged rather than guessed
**Real and wired:**
- Liability split reads the effective-allocation view (explicit → ownership → equal split)
- Follow-on shortlist reads/writes `mortgage_deal_preferences` (existing table, existing columns — `is_shortlisted`/`source_id`), computes payment from the real balance and a real amortization formula, not a static number
- Deal options are filtered by LTV band from `mortgage_rate_deals`, each with a real computed monthly payment at your actual balance/term
- "Deals possible" and "best rate" glimpse figures are live counts/queries, not placeholders

**Flagged as TODO in the code, not silently faked:**
- `home.purchase_value` — I couldn't find where purchase price is stored on `loop_household_properties`; left null with a comment. Point me at the right column/table and it's a one-line fix.
- `householdBuffer` (shown in the original screenshot's bottom stats) — not wired, needs pointing at wherever the household cashflow buffer actually lives.
- `moving_searches` — returns 0, no saved-searches table identified yet.
- Overpayments glimpse card shows "Explore" rather than a real number — that's the calc engine we discussed but haven't built yet. Card and route are ready to receive it.
- Map + home-details cards are deliberately left as a placeholder comment in `HouseOverviewPage.tsx` — you said those didn't need changing, so I didn't touch or duplicate whatever renders them today. Swap in your existing components there.

## To ship this
1. Same `ADJUST` import fixes as every previous delivery (Supabase client + auth) — now in 4 more files
2. Slot your existing map/home-details components into the marked spot in `HouseOverviewPage.tsx`
3. Test the shortlist picker against a real household with a few `mortgage_rate_deals` rows in range — the LTV filter will return nothing if the seeded rate deals don't cover your test property's band, worth checking first
