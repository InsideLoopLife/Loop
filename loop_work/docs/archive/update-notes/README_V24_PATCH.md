# V24 household / income / pension process patch

Run `db/v24_household_income_pension_process.sql` after your existing V23.x migrations.

## Main changes

- Removed React `encType` warnings from server-action forms.
- Dashboard now pulls manual income entries from Income Tracker as well as Household pay events.
- Person profiles now show per-person income/outgoing calendar data, including manual income entries and planned items.
- Person `active_from`/`active_until` is no longer presented as the main household model; new schema scaffolds person ownership, visibility and future household join-code logic.
- Pension fund add/update now attempts to auto-fill unit price, fee and source from `provider_fund_glossary` when the user leaves fields blank.
- Pension daily snapshot cron now updates fund values from glossary price data and applies monthly contribution units idempotently once per fund/month.

## New migration

`db/v24_household_income_pension_process.sql`

This adds:

- person ownership/visibility scaffold
- household join-code scaffold
- income entry payment timing fields
- pension contribution events
- provider glossary check scheduling fields

## Cron

Call `/api/cron/investment-pension-snapshot` with your `CRON_SECRET` to refresh pension values and apply projected monthly contributions.


## V24.4 account/email notes

Run `db/v24_4_account_email_household_sync.sql` after the previous migrations.

For local Gmail SMTP testing, add these to `.env.local` and keep the password out of code/Git:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=help@gamingnectar.com
SMTP_APP_PASSWORD=your_google_app_password_here
EMAIL_FROM="Loop <help@gamingnectar.com>"
EMAIL_REPLY_TO=help@gamingnectar.com
APP_BASE_URL=http://localhost:3000
```

Password reset and email verification are Supabase Auth emails. For those to come from your Gmail/business mailbox, configure **Auth > SMTP settings** in Supabase using the same mailbox. The app-level SMTP is for Loop digests, test emails and invite prompts.

If an app password was pasted into chat or committed anywhere, revoke it in Google and create a new one before using the app online.
