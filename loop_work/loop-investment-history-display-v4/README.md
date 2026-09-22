LOOP Investment History + Display v4

Built against the current main source after the v2 chart/currency repair.

Changes:
- 6M/YTD use the 1h stored backfill, which currently covers all 80 holdings in the affected portfolio.
- Selected small holdings are always included in the observed-history request.
- Backfilled portfolio history appends the latest saved portfolio value when the stored series is stale.
- Thinner chart lines/markers.
- Mini-chart midpoint timestamp comes from actual data.

The installer performs all required matching before writing either source file, so a mismatch will not leave a partial patch.
