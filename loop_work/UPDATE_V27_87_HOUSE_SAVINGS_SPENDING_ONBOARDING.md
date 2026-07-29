# v27.87 - House empty state, Savings ladder, Spending setup and dev compile pass

## User-facing changes
- Wealth nav now shows **Savings** instead of Accounts and **House** instead of Mortgage.
- Net Worth, Affordability and Can I Afford are removed from the main Wealth nav for now.
- House page now has a proper first-run empty state with a cartoon street and **Let’s get tracking** CTA instead of zero-value boxes.
- Adding a first house stores a local next-step flag so the mortgage/rate modal opens on the next render if no mortgage exists.
- Future purchase/move planner has been removed from House for now.
- Mortgage/rate cards now show an indicative follow-on/SVR monthly payment estimate.
- Income add modal no longer shows Household/shared unless the user is actually in a household.
- Income person selection now uses profile/avatar chips rather than a dropdown.
- Spending opens the Category modal automatically on first run if no categories exist.
- Spending calendar is duplicated near the top so the selected month is obvious before the user adds anything.
- Child-cost and student-loan sections are hidden unless they are relevant.
- Spending tiles expand to use space and show counts/summary where possible.

## Savings
- `/accounts` now acts as a Savings/cash-ladder page.
- Adds provider catalogue with recognisable text-logo treatment for common UK banks/building societies/platforms.
- Adds savings fields: product/account type, rate, rate-end date, top-up day, monthly top-up, start/end date and opening-balance assumption.
- Savings projection chart uses balance, top-up and rate assumptions.

## Infrastructure/performance
- `npm run dev` now uses `next dev --turbo`; `npm run dev:webpack` keeps the old dev mode available.
- Several main pages are constrained to 2000px to avoid oversized layouts.

## SQL
Run:

```sql
db/v27_87_savings_house_spending_onboarding.sql
```

This adds optional savings-ladder columns to `financial_accounts` and creates/seeds `loop_financial_institution_catalog`.
