# v28.28 - Income edit and allocation repair

Fixes income rows appearing as `Household` when they should belong to a person, especially legacy salary rows created before household/person scoping was tightened.

## Included

- All current income rows now expose an Edit button.
- Income archive rows now expose an Edit button.
- Manual income rows can be edited, not only deleted.
- Recurring salary/maternity rows can be edited directly from Income.
- Student loan balance cards can be edited.
- Recurring income and manual income require a person; they no longer silently save as `Household / shared`.
- Legacy rows with `person_id is null` are resolved to the matching self/partner person using `user_id`, `owner_user_id`, `linked_user_id` and household membership.

## SQL to run

Run:

```sql
\i db/v28_28_income_edit_allocation_fix.sql
```

or paste `db/v28_28_income_edit_allocation_fix.sql` into Supabase SQL editor.
