# LOOP v28.90 — Historical chart waterfall and consolidated Financial Flow navigation

## Historical investment chart waterfall

The investment history API now uses an explicit evidence waterfall for every selected range:

1. **Saved portfolio snapshots** — complete, cash-flow-aware account/portfolio snapshots. A point is only accepted when at least 95% of the selected portfolio is represented and the latest point reconciles to the current value.
2. **Stored instrument history** — shared LOOP price points for recognised tickers and mapped funds.
3. **Direct market history** — delayed Yahoo history for recognised instruments when LOOP does not yet hold enough stored points. Responses are cached briefly by range to avoid repeated provider calls.
4. **Current-value baseline** — used only when no evidenced series exists. It does not fabricate old portfolio values.

The API returns the stages, point count, source and represented-value coverage. The investment hub displays these stages below the chart so the user can see what was used.

### Range behaviour

- 1D: five-minute direct history fallback.
- 5D: thirty-minute direct history fallback.
- 1M / 6M / YTD / 1Y: daily history.
- 5Y / MAX: weekly history to keep the long view responsive.

The selected range reports both absolute and percentage movement. When the line is based on current holdings and historical market prices rather than full portfolio snapshots, LOOP labels it **Market-performance estimate** and states that purchases, sales, cash movements and dividend reinvestments are excluded.

Google Finance is not scraped. The current direct fallback is Yahoo through a contained server-side adapter; another licensed/provider adapter can be added later without changing the chart UI.

## Financial Flow navigation

The main Wealth navigation is consolidated to:

- Your LOOP
- Overview
- Financial Flow
- Pensions & Investments
- House

Accounts, income, spending, savings and pots remain fully available inside Financial Flow and through contextual links, but no longer occupy separate primary navigation positions.

## Database

No migration is required for v28.90.
