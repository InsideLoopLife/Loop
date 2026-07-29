# V24.3 — Account admin, permissions, emails and maternity overrides

This patch focuses on the account/household model rather than adding new finance features.

## Added

- Account page now has tabs:
  - Account information
  - Account security
  - Email & notifications
  - Admin rights & permissions
- Household now has a friendly name, code, timezone and currency.
- User account profile supports full name, phone, avatar upload and verification status scaffold.
- Household members support permission tiers:
  - owner
  - admin
  - parent
  - member
  - viewer
  - child managed
- Parent/guardian allocation for child profiles.
- Creator/admin links remain hidden from normal users and are surfaced inside Account permissions only.
- Maternity pay can now be corrected with exact month-by-month overrides using statutory pay + occupational pay + optional net override.
- Dashboard pay-event query is more tolerant and now uses exact maternity overrides where available.

## Run this migration

```sql
-- Supabase SQL Editor
db/v24_3_account_admin_permissions_maternity.sql
```

## Email sending

The admin email builder still uses the existing V22 email infrastructure.

Required env vars for real sends:

```env
APP_BASE_URL=http://localhost:3000
APP_CREATOR_EMAILS=your@email.com
RESEND_API_KEY=
EMAIL_FROM="Loop <updates@yourdomain.com>"
EMAIL_REPLY_TO=
CRON_SECRET=long_random_value
```

If `RESEND_API_KEY` is blank, templates/previews/logs still work, but real email sends are skipped.

## Maternity correction workflow

1. Open Bethany's person profile.
2. Open the month in the calendar.
3. Expand the maternity pay event.
4. Add exact statutory pay and occupational pay for that month.
5. Optional: enter net pay override if you have the payslip take-home.

The dashboard then uses that exact override for that month rather than the formula estimate.
