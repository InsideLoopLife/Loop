# v27.55 — Handover Review + Onboarding + Investment Lookup + Profile Polish

## Run SQL

Run:

```sql
db/v27_55_handover_onboarding_investment_profile_polish.sql
```

Then verify:

```sql
select * from public.app_v2755_healthcheck();
```

Every row should return `ok = true`.

## What changed

- Added a handover review page at `/notifications/[id]` so Bethany can see the areas Dan added data to before accepting it.
- Handover detail cards link to Income, Spending, Nutrition or Household depending on the rows included.
- Fixed stale Supabase check constraints that caused account prompt / data handover / household deletion errors.
- Added first-run onboarding at `/onboarding` with a checklist: salary, bill, household, investment, pension and mortgage.
- Added a lightweight page tour popup for Dashboard, Nutrition, Income, Spending and Investments.
- Free/manual investment tier now allows basic stock/ETF/fund lookup using delayed/manual-safe data. Paid tiers can still unlock richer/realtime sources later.
- Account hero now has an `Edit name/photo` shortcut and safer avatar rendering so broken storage URLs fall back cleanly instead of showing a broken image icon.
- Household cards are laid out as one full-width card when only one household exists, with max two cards per row for multiple households.
- Avatar storage buckets/policies are recreated for user, person and household images.

## Multi-household model

A user can belong to more than one household. The active household controls shared rollups and pages. Private records remain owned by the user; household-specific records should store the active `household_id` so data does not leak into the wrong shared context.

Pros:
- Useful for separated families, caring for parents, or shared childcare planning.
- Lets one adult keep their own private data while participating in multiple shared dashboards.

Cons:
- Every shared record needs clear household context.
- UI must always show which household is active before adding bills, food allocations or child costs.

## Tests

1. Run SQL and healthcheck.
2. Open `/onboarding` and verify the checklist cards.
3. Open `/notifications`, click a profile handover notification, then accept/decline from the detail page.
4. Check investments: search for `AAPL`, `VWRP`, `VUSA`, `G4M`, `Vanguard Global All Cap`.
5. Upload/change account profile image and confirm it either shows or falls back to initials.
6. Go to Account → Households & sharing and confirm a single household fills the row.
7. Delete a test household with `DELETE`.
