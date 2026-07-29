# LOOP v28.13 - AI mortgage catalogue, House admin and provider-light property enrichment

## What changed

### Admin navigation rework

The admin nav is now more product/domain oriented:

- **Admin > Investments** groups investment coverage, market data, chart storage and broker integration links.
- **Admin > House** groups mortgage catalogue, mortgage-watch quality, EPC/council-tax enrichment, UPRN decisions and valuation automation.
- **Admin > Savings** groups savings deal source jobs, savings recommendations and surplus optimiser work.

The older direct admin URLs still exist but are hidden from the top nav so existing links and code do not break.

### Mortgage catalogue without official provider integration

Added a provider-light mortgage catalogue flow:

1. Admin saves lender/source pages in `mortgage_lender_sources`.
2. The new catalogue refresh job fetches the source page.
3. It extracts likely mortgage products into `mortgage_rate_deals`.
4. New/source-extracted products default to `needs_review` unless confidence is extremely high.
5. The user-facing mortgage watch now only uses `active` mortgage catalogue rows.
6. Removed/stale products are marked as `expired` / `removed`, not deleted.

New route:

```text
/admin/houses
```

New cron/API route:

```text
/api/cron/mortgage-catalogue-refresh
```

### User quality loop

Users can report a mortgage recommendation as wrong/broken from the mortgage deals tab.

That creates a row in:

```text
mortgage_rate_deal_flags
```

Admin sees the flagged product under:

```text
/admin/houses?tab=quality
```

When fixed, admin can click **Fixed + notify**. LOOP resolves open flags for that mortgage product and creates in-app notifications for the affected users.

### Property enrichment notes

Listings can be used to extract EPC rating and council tax band where present. If the listing is a new build or the listing does not expose the field, keep the field user-editable and store the source/confidence trail.

FindMyAddress should be treated as a manual spot-check tool only, not an automated LOOP scraper. Production UPRN automation should use OS Open UPRN / OS Data Hub or a licensed address provider.

## SQL to run

Run after v28.12:

```sql
db/v28_13_ai_mortgage_catalogue_admin_reorg.sql
```

Current order from this feature set:

```sql
db/v28_08_inbound_email_premium.sql
db/v28_09_inbound_email_hardening.sql
db/v28_10_loop_inbox_postmark_admin_checklist.sql
db/v28_11_mortgage_page_data_source_workflow.sql
db/v28_13_ai_mortgage_catalogue_admin_reorg.sql
```

## Operational flow

1. Open **Admin > House**.
2. Add lender source pages.
3. Run **AI/source catalogue refresh**.
4. Review extracted products.
5. Publish only products that have checked lender, term, LTV, fee, source URL and eligibility.
6. Run **Mortgage watch**.
7. User sees recommendations in **House > Mortgage deals**.
8. If user flags a product, admin fixes it and clicks **Fixed + notify**.

## Safety rules

- Needs-review mortgage rows are not used for user recommendations.
- User reports are row-level secured and users can only insert/read their own flags.
- Admin fixes are audited.
- Removed products are expired, not deleted, so history remains available.
- Users receive a notification only after admin marks a flagged product fixed.
