# UPDATE V28.21 — Admin Search, Source Universe, Savings/Mortgage Refresh, Investment Cash/Market/P&L

## Why this update exists
This update removes more manual admin work from savings and mortgage source discovery, adds a searchable admin command panel, and tightens investment provider handling for market names, cash buckets, daily movement and logos.

## Admin search
- Added a global admin search button in the admin navigation.
- It searches admin product areas and common functions such as mortgage catalogue refresh, savings source refresh, savings watch, investment cadence, chart storage and broker integrations.

## Savings source automation
- Added `savings_rate_sources` so savings providers/best-buy pages can be seeded and refreshed repeatedly.
- Added a default UK savings source universe covering banks, building societies and best-buy/search pages.
- Added Admin > Savings actions:
  - Seed UK savings + mortgage sources
  - Refresh source catalogue
  - Optimise pipeline: refresh catalogue, run savings watch, expire stale rows
  - Expire stale rows
- The refresh respects a default 12-hour freshness window to avoid wasting AI/source credits.

## Mortgage source automation
- Added a default UK mortgage source universe for broad lender coverage.
- The source universe is seeded through the shared savings/admin source action for now and can be reused by the existing mortgage catalogue refresh.
- User-facing mortgage cards no longer show an `LTV check` pill when LOOP has not actually extracted/confirmed an LTV rule.

## Investment cash and P/L guardrails
- Improved SnapTrade cash bucket parsing.
- Added preservation for user/manual cash overrides when SnapTrade only returns weak/inferred cash data.
- Added day-movement fallback from stored snapshots when broker cost basis/true P&L is missing.
- Reworded true-P&L messaging so LOOP does not pretend it has original cost basis where the provider did not supply it.

## Trading 212 direct API path
Trading 212's public API exposes account summary fields including cash, total account value, invested/current value, total cost, realised and unrealised profit/loss. It also exposes history endpoints for orders, dividends and cash transactions. The app now has an admin task to add this as a direct provider correction layer when SnapTrade does not expose enough detail.

## Market names and logos
- Normalises MIC/exchange codes at import and display:
  - `XLON` / `XLSE` → `LSE`
  - `XNAS` / `XNCM` / `XNGS` → `NASDAQ`
  - `XNYS` → `NYSE`
  - `XASE` → `AMEX`
- Expanded logo-domain matching for common US and UK holdings.

## SQL
Run:

```sql
/db/v28_21_admin_search_savings_sources_investment_market_cash.sql
```

## Notes
A full verified P&L requires provider cost basis, purchase lots, or direct broker API history. LOOP can safely show daily movement from snapshots, but should not label it as all-time P&L unless the original cost basis is verified.
