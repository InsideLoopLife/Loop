# V24.1 patch

Adds a clearer person/account model and fixes income visibility/migration gaps.

Run in Supabase SQL Editor:

```sql
db/v24_1_person_accounts_income_fix.sql
```

Then restart:

```bash
CTRL + C
npm install
npm run dev
```

## What this patch adds

- Person profiles now store email/future login status.
- Person profile shows account/household visibility settings.
- Household add-person form asks for optional email/account status.
- Added account setup prompt scaffold for managed profiles.
- Added missing pay-event and income timing columns that can cause Dashboard income queries to return empty if earlier migrations were skipped.
- Keeps passwords/MFA controlled by Supabase Auth only; household owners never see another person’s password.

## Intended model

Each person can eventually link to their own login. Until then, the household owner manages that person profile. Children can remain managed profiles until maturity/18, then be invited to claim their account history.
