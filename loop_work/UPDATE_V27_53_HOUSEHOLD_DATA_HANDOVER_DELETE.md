# v27.53 — Household data handover + delete household

This update adds two household behaviours:

1. **Prompt a linked adult to keep data that someone else entered for them**
   - Example: Dan has entered Bethany's salary/maternity/cost information.
   - Bethany has now joined with her own account.
   - Dan can open Bethany's household profile and press **Send keep-data prompt**.
   - Bethany receives an in-app notification.
   - If Bethany accepts, the linked profile and person-specific rows are transferred to Bethany's account.
   - If Bethany declines, the data remains household-managed.

2. **Delete household**
   - Owners can delete the household from the Household page danger zone.
   - Requires typing `DELETE`.
   - This soft-deletes the household shell, removes active memberships, expires pending invites, and clears household links from user profiles.
   - It does not delete each user's private account data.

## SQL to run

Run this in Supabase after replacing files:

```sql
-- db/v27_53_household_data_handover_delete.sql
```

Then verify:

```sql
select * from public.app_household_claim_healthcheck();
```

Every row should return `ok = true`.

## Test order

1. Open Household.
2. Open a linked adult profile where data was originally entered by another household user.
3. Press **Send keep-data prompt**.
4. Sign in as the linked user.
5. Open Notifications.
6. Press **Keep / accept**.
7. Check the profile/income lines now belong to that linked account but still appear in household view.
8. Test delete household as owner by typing `DELETE`.

## Notes

This intentionally asks the adult before moving ownership of data. That is safer than silently moving income, spending or health data into someone else's account.
