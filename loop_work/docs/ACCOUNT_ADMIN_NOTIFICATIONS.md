# V22 account, admin and notification model

V22 adds the structure needed for a private hosted app that can safely support household users, account security, digest emails and an in-app notification hub.

## Account/security flows

- Supabase Auth remains responsible for passwords, sessions and recovery links.
- `/reset-password` is public and requests a Supabase password reset email.
- `/account/update-password` is the recovery landing page for setting a new password.
- `/account` lets a signed-in user request a reset email, update household-level profile defaults and manage notification preferences.
- `/account` includes a TOTP MFA enrolment component using Supabase Auth MFA APIs.

Before production:

1. Configure Supabase Auth redirect URLs:
   - `http://localhost:3000/**` for local
   - `https://your-domain.com/**` for production
2. Set `APP_BASE_URL` to the production domain.
3. Enable/verify MFA settings in Supabase Auth.
4. Disable public sign-ups or set up invitation-only access.

## Admin model

`/admin` is creator-only. Access is granted by either:

- `APP_CREATOR_EMAILS=you@example.com`, or
- a row in `app_admin_users` with your email.

For a production deploy, prefer both:

```sql
insert into app_admin_users (email, role, status)
values ('you@example.com', 'creator', 'active')
on conflict (email) do update set status = 'active', role = 'creator';
```

The admin page manages:

- Email templates for weekly/monthly updates
- Test/preview email runs
- In-app notification creation
- Digest wording/tone before automated jobs are enabled

## Notifications

`app_notifications` stores private in-app nudges. These can be created by:

- Admin actions
- Scheduled cron jobs
- Future event triggers such as renewal windows, spending spikes or meal-plan gaps

## Email sending

Resend support is scaffolded server-side. Emails are only sent if `RESEND_API_KEY` is present. Otherwise, the app records previews/test runs without sending.

Set:

```env
RESEND_API_KEY=
EMAIL_FROM="Life Tracker <updates@yourdomain.com>"
EMAIL_REPLY_TO=
```

Authenticate your sending domain before production.

## Scheduled digests

`/api/cron/weekly-digest` is protected by `CRON_SECRET`.

Vercel Cron/Supabase Edge Functions can call it with:

```http
GET /api/cron/weekly-digest
x-cron-secret: <CRON_SECRET>
```

It creates an in-app notification and, if email is configured, sends a weekly email.
