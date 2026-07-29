# LOOP v28.03 - Wealth Watch admin + cron hardening

## Summary
This update turns the v28.02 savings/mortgage watch foundation into an admin-controlled beta system.

## Added
- Admin → Wealth Watch tab.
- Manual admin run buttons for:
  - Savings rate watch
  - Mortgage renewal watch
- Admin controls for job variables:
  - minimum savings rate uplift
  - max savings recommendations per account
  - savings stale-days threshold
  - mortgage alert months
  - mortgage stale-days threshold
  - max mortgage recommendations per mortgage row
- Admin source checking:
  - savings source URL check
  - mortgage lender source URL check
  - draft/needs-review deal creation
- Manual deal entry for:
  - savings deals
  - mortgage deals
- Stale-deal expiry action:
  - marks old rows as expired
  - does not delete source rows
- Cron protection:
  - `/api/cron/savings-rate-watch`
  - `/api/cron/mortgage-renewal-watch`
  - both require `CRON_SECRET` in production
- Server-side tier enforcement inside the jobs:
  - Free/locked users are skipped by the cron
  - recommendations are only generated for users with the feature enabled
- Mortgage lender source mapping table.
- Seed lender source mappings for common UK lenders.
- Moving URL ingestion helper:
  - extracts rough price/postcode/bedrooms/EPC/council-tax where visible in page text
  - stores assumptions in the move planner

## MVP scope
Savings rate watch now recommends better deals for users who already track savings accounts/rates. Full household surplus optimisation is introduced as a separate higher-tier feature key, but not forced into the MVP recommendation logic yet.

## Required environment variable
Add this server-side before production cron runs:

```env
CRON_SECRET=use-a-long-random-secret
```

Vercel Cron should call the scheduled routes with the configured secret. For local testing, you can call the URL with `?secret=...` or use the Admin → Wealth Watch run buttons.

## SQL
Run:

```sql
db/v28_03_wealth_watch_admin_cron_hardening.sql
```

## Notes
The source checking is deliberately conservative. It parses obvious rates from source pages and saves draft/needs-review rows for admin confirmation. It does not claim fully automated whole-market sourcing yet.
