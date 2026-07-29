# v27.85 — Product RPC, House, Pension and Household ownership fix

## SQL to run

Run this after v27.84:

```sql
-- Supabase SQL editor
-- db/v27_85_house_product_pension_household_fix.sql
```

## Admin fixes

- Replaces `loop_admin_products_list` with a string-built, column-safe RPC so the product admin no longer fails with `malformed array literal`.
- Replaces `loop_admin_product_imports_list` so import rows are read from JSON projection instead of assuming `source_name` exists as a physical column.
- Keeps product quality overrides in `loop_product_quality_snapshots` and left-joins them to the raw nutrition/product library, so a small quality table cannot hide the rest of the user database.
- Adds `loop_product_review_queue` and `loop_queue_product_for_review(...)` so user-created products can be queued for admin review instead of automatically becoming trusted global records.
- Queues starter ingredient/product intelligence records for admin review when a user creates one from the nutrition database page.
- Investment coverage seeds are now persisted as `covered`, not shown as “run v27_83 to persist this row”.
- Investment coverage dashboard copy now explains that normal additions should be made from the UI, with generated SQL kept as an audit/backstop only.

## Household ownership fixes

- Adds `app_repair_household_people_links()` to repair real `people` rows for claimed household accounts.
- Calls that repair after household invite acceptance.
- Adds a one-off repair block so existing claimed members become selectable as house, pension and investment owners under the household owner data store.

## House tab updates

- Navigation label changed from Mortgage to House.
- Homes can now store an `image_url` backdrop.
- House modal uses light/glass styling with dark input text for readability.
- Home cards now show a top-right affordability score out of 100, clickable for the score breakdown.
- Future purchase/move planning UI is removed from the main House page for now.
- Main House content is capped at 2000px.

## Pension updates

- Pension pots now support salary-sacrifice NI logic using:
  - `employer_ni_topup_mode`
  - `employer_ni_rate_percent`
  - regular pay day
  - pension payment timing
  - contribution delay days
- Salary sacrifice NI top-up can now scale with pay rises instead of being forced into a fixed monthly amount.
- Add menu now exposes Defined Benefit pension separately from DC/workplace/private pots.

## Checks

A TS/TSX transpile smoke check passed for the changed TypeScript/React files. A full Next build still requires local `node_modules`.
