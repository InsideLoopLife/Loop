# LOOP v28.21.1 - SQL priority hotfix

Fixes the v28.21 SQL failure:

```txt
ERROR: column "sort_order" of relation "app_future_integration_tasks" does not exist
```

The checklist table uses `priority`, not `sort_order`.

## What changed

- Corrected `db/v28_21_admin_search_savings_sources_investment_market_cash.sql`.
- Added standalone `db/v28_21_1_task_priority_hotfix.sql`.
- Preserves completed checklist rows when rerun.

## What to run

If the v28.21 SQL failed part-way through, run the corrected full SQL again:

```sql
db/v28_21_admin_search_savings_sources_investment_market_cash.sql
```

If everything else applied and only the final checklist insert failed, run:

```sql
db/v28_21_1_task_priority_hotfix.sql
```
