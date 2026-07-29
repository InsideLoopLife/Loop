# UPDATE v28.28.1 — Income SQL lateral hotfix

This hotfix repairs the v28.28 SQL migration failure:

```text
ERROR: 42P10: invalid reference to FROM-clause entry for table "r"
```

Cause: the previous repair migration used `UPDATE ... FROM lateral (...)` and referenced the update target alias (`r`) inside the lateral FROM item. PostgreSQL does not allow that reference pattern.

Fix: the person-allocation repair now uses correlated scalar subqueries in the `SET person_id = (...)` clause, which can safely reference the update target row.

Run either:

```text
db/v28_28_income_edit_allocation_fix.sql
```

or the explicit hotfix copy:

```text
db/v28_28_1_income_sql_lateral_hotfix.sql
```

Both are idempotent and safe to run again if the earlier attempt partially applied column/index changes.
