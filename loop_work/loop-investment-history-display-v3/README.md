# LOOP investment history/display v3

This patch addresses the issues visible in the live investment screenshots:

1. Six-month backfill: production contains historical instrument points back to 2021, but the 6M route was asking only for the `1d` bucket. For the 80-holding account, only 17 holdings currently have 1d rows while all 80 have the 1h backfilled series. 6M/YTD therefore use the stored 1h backfill.
2. Small selected holdings: the dashboard only fetched observed series for the 16 largest holdings. The selected holding is now always included, so small holdings such as NUE can load their chart.
3. Current endpoint: if the backfill ends before the latest saved portfolio value, a current point is appended so the historical line reaches now.
4. Thinner chart strokes and smaller point markers.
5. Mini-chart midpoint timestamp is calculated from the data rather than hard-coded to 12:00.

No synthetic gains/losses are created. The appended point is the current saved portfolio value.

Install, inspect git diff, then commit.
