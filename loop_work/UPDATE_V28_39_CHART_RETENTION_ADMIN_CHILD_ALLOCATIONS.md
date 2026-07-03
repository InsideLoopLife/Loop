# v28.39 chart retention, market admin coverage and child-cost allocation

## Investment chart fixes
- Stored market-worker points are now preferred over generated provider history whenever available.
- The history API no longer appends the latest saved holding value onto generated history, removing false spikes at the start/end of charts.
- Chart hover marker is rendered as a CSS overlay instead of an SVG circle so it does not warp.
- Chart labels are simplified for 1D/5D/1M/6M/YTD/1Y/5Y/Max ranges.
- Chart refresh cadence is set to 60 seconds.

## Market session and logging
- Market-worker logging is market-hours only by default.
- Closed markets are skipped and not logged to price history.
- US pre-market and after-market are treated as tradeable sessions where supported.
- LSE/AIM close is enforced at 16:30 Europe/London.

## Retention policy
- 1 minute points for the current day / first 24 hours.
- 15 minute buckets from 1 day to 5 days.
- 1 hour buckets after 5 days.
- No daily/weekly compaction in this version.

## Admin market coverage
- Seeds a broader global market venue/alias catalogue for Trading212/SnapTrade/manual imports.
- Adds broker/index aliases such as UK100, US500, US100, GER40, FRA40, HK50, IN50, AUS200, JP225 and more.

## Child-cost allocation
- Child costs now separate the child the bill relates to from the person/household it is billed to.
- `child_costs.child_id` remains the child.
- `child_costs.bill_person_id = null` means Household/shared.
- Spending calendar supports editing child costs and allocating nursery fees to Household/shared.
