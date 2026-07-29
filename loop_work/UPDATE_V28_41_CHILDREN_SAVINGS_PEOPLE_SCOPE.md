# v28.41 - Children restore and savings/person ownership scope

## Fixes

- Restores child profiles incorrectly auto-archived by the v27.93 duplicate repair when no active duplicate exists.
- Adds person-level ownership to savings/cash accounts.
- Lets savings accounts be personal, joint, household/shared, or child-owned.
- Adds allowance scope so future logic can distinguish individual ISA/savings allowances from joint/household balances.
- Keeps household visibility separate from account ownership.

## Deploy

1. Deploy the code update.
2. Run `db/v28_41_children_savings_people_scope.sql` in Supabase.
3. Refresh `/household` and `/accounts`.

## Notes

Savings accounts now have three separate concepts:

- `owner_person_id`: whose account it is.
- `ownership_scope`: personal, joint, household, or child.
- `visibility_scope`: private or visible in household planning.

This avoids treating all tracked savings as household-owned just because the user is in a household.
