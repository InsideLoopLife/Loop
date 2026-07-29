# Admin Control Centre

`/admin` is the protected developer/admin view for Loop. It is designed to be user-led rather than a raw developer console.

## Access model

Default admin email: `help@gamingnectar.com`.

The admin page checks the signed-in Supabase user email before it checks database roles. This means a row in `app_admin_users` cannot widen access unless the email is also allowed by `APP_ADMIN_EMAILS` / `LOOP_ADMIN_EMAILS` or the default admin email.

Recommended production environment:

```bash
APP_ADMIN_EMAILS=help@gamingnectar.com
SUPABASE_SECRET_KEY=<server-side service role key>
APP_BASE_URL=https://your-domain.example
```

## First-time password setup

Visit `/admin/setup` and submit the allowed admin email. The action:

1. verifies the email is allow-listed;
2. creates the Supabase Auth user if missing;
3. upserts the `app_admin_users` row;
4. generates a Supabase recovery link;
5. emails the setup link so the password is set by the user, not exposed in the UI.

## What the admin page shows

- signed-in admin identity and access reason;
- user profiles and notification-channel status;
- admin allow-list / DB role status;
- runtime readiness checks;
- table-level database health;
- recent notifications;
- in-app nudge creation;
- email template preview/test controls.

## Security notes

- Do not put the Supabase service key in any `NEXT_PUBLIC_*` variable.
- Keep `/admin/setup` behind the same private beta gate when `LOOP_ACCESS_REQUIRED=true`.
- If the email provider is not configured, password setup cannot be sent by email.
- If `APP_BASE_URL` is wrong, password setup/recovery links may point to localhost.
