# v28.98 — compact flow, household assumptions and income compatibility

## Financial Flow

- Replaced the oversized diagram and full-screen category modal with four compact totals and expandable grouped rows.
- Each spending row now states its reporting category, exposes the included source lines inline and links directly to spending to change the category.
- Car finance, leases, PCP and recognised vehicle providers are grouped under **Car & motoring**, rather than general travel.
- Spending links retain the selected month.

## Household assumptions

- Adopting the researched food assumption now creates or updates a shared household monthly planned item.
- The adopted line feeds spending and Financial Flow like other planned household costs.
- Logged food shopping replaces the assumption in Financial Flow for that month, avoiding double counting.

## Income Command Centre

- Added a compatibility query when optional newer `pay_events` columns have not yet been migrated.
- Existing core income rows remain visible and editable instead of the page silently displaying £0.
- A small compatibility notice explains when the fallback is active.

## Migration

Run `supabase/migrations/202607171810_household_assumption_income_compatibility.sql` after the earlier v28.94–v28.97 migrations.

It restores the household membership helper, adds missing household assumption and optional pay columns idempotently, and requests a PostgREST schema-cache reload.

