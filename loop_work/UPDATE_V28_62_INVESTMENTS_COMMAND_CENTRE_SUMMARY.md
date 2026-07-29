# LOOP v28.62 — Investments command centre summary

## What changed

- Reworked the investments landing page into a summary-first command centre.
- Removed the separate realtime/broker-import promo boxes from the page body.
- Kept the top pensions/investments hero, but made the market data tier card clickable and more obvious.
- Added SnapTrade-style `ST` mark on tiers that can connect paid providers; manual tiers show the pencil icon.
- Added larger summary cards, closer to the spending-page card style:
  - Total wealth
  - Investments
  - Pensions
  - Market data
  - Performance
- Added pension snapshots by person/household.
- Added investment snapshots by person/household.
- Snapshot cards are clickable and switch the detailed area to pensions or investments for that person.
- Upgraded the amplified investments module into an investment command centre.
- Ticker strip now scrolls continuously instead of being a static row.
- Ticker strip prioritises the user’s own holdings and fills with popular symbols where needed.
- If the global instrument price table has recent popular-symbol prices, those are shown in the fallback ticker.
- Retains the dark/light toggle, period selector, purchase/cost dotted line, glowing chart line and diversification notches.

## Files changed

- `app/investments/page.tsx`
- `components/investments/PensionsInvestmentsClient.tsx`
- `components/investments/AmplifiedInvestmentsDashboard.tsx`
- `app/globals.css`
- `db/v28_62_investments_command_centre_summary_ui.sql`
- `supabase/migrations/202607071130_investments_command_centre_summary_ui.sql`

## Notes

No schema changes are required. The fallback popular ticker prices come from `investment_instrument_price_points` where those symbols exist. If the worker has not priced a popular symbol yet, the ticker still appears as a popular market item rather than inventing a live price.
