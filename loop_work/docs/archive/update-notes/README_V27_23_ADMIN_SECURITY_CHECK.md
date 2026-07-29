# V27.23 — Admin security and pre-update check

## Added

- `/admin` redesigned as a user/permissions/system-health control centre.
- `/admin/setup` for first-time admin password creation/recovery.
- Admin access is restricted to `help@gamingnectar.com` by default.
- `APP_ADMIN_EMAILS` / `LOOP_ADMIN_EMAILS` can explicitly set the allow-list later.
- Admin access checks the email allow-list before DB roles, so DB rows cannot widen access unexpectedly.
- Database table health checks and environment readiness checks are shown in the admin UI.
- Migration: `db/v27_23_admin_access_control.sql`.

## Validation performed

- `npm ci` completed successfully.
- `npx tsc --noEmit` passed.
- `npm run build` compiled successfully, then timed out in the sandbox while Next was running its later TypeScript/build phase.

## Production setup notes

Set:

```bash
APP_ADMIN_EMAILS=help@gamingnectar.com
APP_BASE_URL=https://your-live-domain
SUPABASE_SECRET_KEY=<server-side service-role key>
```

Then run `/admin/setup` to send the first password setup link.
