# V27.22 – Notifications channels, approvals and private beta access

## Notifications

- Removed the old test-notification wording from the hub.
- Added channel tabs:
  - All
  - Wealth
  - Lifestyle
  - Household
- Household invites and approval-style notifications are sorted to the top.
- Household/profile/food allocation notifications can now show accept/decline controls.
- Added a weekly preview generator for in-app insight cards:
  - investment progress snapshot
  - weekly nutrition insight
- Added a scheduled cron endpoint for weekly notification insights:
  - `/api/cron/notification-insights`
  - guarded by `CRON_SECRET`
- Notifications now store optional `category`, `channel`, `action_status`, `period_key`, `expires_at` and `metadata` fields.

## Private beta access gate

- Added `/access` landing page.
- Unauthenticated users are sent to `/access` before `/login` when the access gate is configured.
- Access code is checked server-side and is not printed into the page.
- The gate sets an HTTP-only cookie after a successful unlock.

Production env guidance:

```bash
LOOP_ACCESS_REQUIRED=true
LOOP_ACCESS_CODE_HASH=<sha256 of CODE:SALT>
LOOP_ACCESS_CODE_SALT=loop
LOOP_ACCESS_COOKIE_VALUE=<random opaque secret value>
```

Generate a code hash:

```bash
node -e "const crypto=require('crypto'); console.log(crypto.createHash('sha256').update('YOURCODE:loop').digest('hex'))"
```

## Help

- `/help` now has an ask box.
- It uses the saved OpenAI token where available and falls back to built-in feature help.

## Migration

Run:

```sql
-- db/v27_22_notifications_beta_gate.sql
```
