# v27.54 Household notifications, privacy and polish

Run:

```sql
-- paste/run db/v27_54_household_notifications_privacy_polish.sql
select * from public.app_v2754_healthcheck();
```

Expected: every `ok` should be `true`.

## What changed

- Fixes check-constraint errors for:
  - `people_account_status_check`
  - `person_account_prompts_status_check`
  - `app_households_status_check`
- Removes the old profile account-prompt UI from person profiles.
- Keeps the new account/linking flow based on household invite/QR + keep-data prompt.
- Adds nutrition/food allocation notifications when food or drink is logged for another linked adult.
- Notification accept moves those food logs into the linked adult's own account.
- Notification decline marks the allocated logs as declined.
- Adds household finance read policies so shared income/cost/wealth records can roll up across active household members.
- Adds the card privacy model:
  - products / ingredients = reusable reference data
  - recipes / meals / takeaway menu estimates = household-private
- Fixes false nut-allergen matches caused by the substring `nut` inside words like `nutrition`.
- Tidies the household/profile UI by removing duplicate account prompt controls and reducing permission-chip clutter.

## Test order

1. Restart localhost.
2. Log food for Bethany from Daniel's account.
3. Sign in as Bethany and check Notifications.
4. Accept the nutrition allocation.
5. Confirm the food log appears under Bethany and still rolls up to the household.
6. Send a keep-data prompt for Bethany's profile and accept it.
7. Delete a test household by typing `DELETE`.
8. Check `/income`, `/dashboard`, `/accounts`, `/net-worth` from both household users.
