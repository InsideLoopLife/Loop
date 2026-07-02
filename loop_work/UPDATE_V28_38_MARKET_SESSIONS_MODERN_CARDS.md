# v28.38 Market sessions + modern investment cards

Fixes the investment page market-status logic so LSE/AIM close at 16:30 Europe/London using timezone-aware local market time rather than fixed UTC minutes.

Adds:
- timezone-aware live/early/sunset/closed status
- status hover with local market time, open/close and last check
- US extended-hours price selection from Yahoo pre/post market data when available
- clickable holding cards opening the detailed chart/info modal
- full interactive chart inside the holding modal using stored LOOP price points
- faster page/chart refresh cadence without paid AI calls

Run `db/v28_38_market_sessions_modern_cards.sql` after deploying.
