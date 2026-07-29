# v28.17 — Property move planner + mortgage comparison hardening

## Property URL ingest

- Added stronger listing parsing for Rightmove/Zoopla/OnTheMarket style pages.
- Council tax now looks for structured keys such as `councilTaxBand` and visible text such as `Council Tax Band: F` before falling back.
- EPC extraction now checks structured and visible patterns.
- Listing titles are cleaned so saved cards show the property/address area rather than raw page-shell text such as `Skip to content` or `JavaScript disabled`.
- Listing image URL is stored on the move query when found.
- Source confidence is saved with each move query. Scraped council-tax/EPC fields should be treated as decision-grade only when confidence is 95%+.

## Moving Home UI

- Reworked saved search cards to show a property image, price box, mortgage estimate, council tax, EPC, running cost and a clickable affordability score.
- Added More details modal with comparative scoring against the current home.
- More details shows reasons for score, current-property comparison, stamp/moving costs, EPC/energy and council tax confidence.
- Replaced the user-facing `URL ingested` wording with `Listing`, `Partial listing` or `Manual scenario`.

## Archive retention

- Archived move searches now receive `archived_at` and `delete_after`.
- Added `/api/cron/property-archive-cleanup` to delete archived move searches after 14 days.
- Added SQL for image URL, archive timestamps and delete-after index.

## Mortgage deals

- Added search and term filter inside the mortgage deals section.
- Added a comparison calculator at the top of the deals section.
- Users can select a deal, change assumed mortgage term from 1–40 years, add optional costs, and choose whether to absorb those costs into the mortgage.
- Comparison shows balance used, estimated payment, monthly difference versus current payment and initial-period cost.

## SQL

Run after v28.16:

```sql
db/v28_17_property_move_confidence_mortgage_compare.sql
```

## Cron

Schedule daily or weekly:

```txt
/api/cron/property-archive-cleanup
```

Use the same `CRON_SECRET` protection as the existing wealth-watch jobs.
