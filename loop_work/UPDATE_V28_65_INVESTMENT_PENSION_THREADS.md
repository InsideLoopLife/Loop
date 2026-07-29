# V28.65 — Investment/pension thread + live-view movement fix

## What changed

- Removed the separate **Market data / Realtime / ST** overview card from the investments overview.
- Fixed the live-view buttons so they sit at the bottom of the overview boxes.
- Made the investment live view render as a full-width dark page rather than a small boxed section inside the normal overview canvas.
- Hardened portfolio snapshot aggregation so a partial refresh cannot be drawn as a full portfolio total.
- Fixed bundled asset daily movement math: bundled rows now keep per-unit day movement, preventing the value being multiplied twice.
- Changed unverified provider performance tiles to show **P/L pending** instead of a misleading stored movement number.
- Added a **Holding thread** to every stock/ETF/fund info panel, using purchase lots/imported lots to show tranches, average price, costs and current check value.
- Added a **Pension thread** to pension pots, using `pension_contribution_events` to show last invested amount, unit price, allocation and salary-sacrifice/NI split.
- Added migration `202607071650_investment_pension_threads.sql` to ensure thread tables/columns/indexes exist.

## Important behaviour note

Pensions still do **not** automatically scrape L&G or PensionBee live values. The existing pension refresh logic can:

- roll fund rows into a pot value when units/current fund values are stored;
- mark provider-value pots as needing a statement when stale;
- generate contribution events from salary/contribution rules.

For L&G/PensionBee, the provider portal/statement remains the source of truth unless a real provider/broker integration is added.

## Files changed

- `app/investments/page.tsx`
- `components/investments/PensionsInvestmentsClient.tsx`
- `components/investments/AmplifiedInvestmentsDashboard.tsx`
- `db/v28_65_investment_pension_threads.sql`
- `supabase/migrations/202607071650_investment_pension_threads.sql`
