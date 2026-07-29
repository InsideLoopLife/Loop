# v27.48 Household, Wealth and Nutrition Fix

Run this migration after replacing files:

```sql
-- db/v27_48_household_rpc_wealth_nutrition_fix.sql
```

This update:
- Removes the need for a Supabase service-role/admin key for normal household creation, invite creation and invite joining on localhost.
- Adds secure Supabase RPCs for household create/join/invite flows.
- Changes the wealth strip from duplicated navigation into a true financial summary pulling from accounts, property, mortgage, income, spending, pension and investments.
- Makes Dashboard use the signed-in user's wealth data so it matches Income/Spending/Accounts.
- Includes financial accounts in Net Worth.
- Hides Admin from the account dropdown unless the signed-in email is admin-allowed.
- Adds Household above Sign out in the account dropdown.
- Fixes GFuel/Supplement Facts macro/micro transparency by storing label per-serving data and supplement facts.

Env notes:
- `APP_ADMIN_EMAILS=dan@insideloop.life` or leave unset now defaults to dan@insideloop.life.
- If `SUPABASE_SERVICE_ROLE_KEY` is wrong, remove it from `.env.local` while testing these RPC paths. The household flows no longer need it.
- Invite emails need Resend or SMTP configured. If not configured, an invite link is still created and the skipped email attempt is logged.


## Invite token note
The household invite token is hex-only in this build, so invite URLs do not break because of `+`, `/` or `=` characters in query strings.
