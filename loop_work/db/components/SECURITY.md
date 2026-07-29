# Security notes

This app is designed as a private household tracker. It contains financial and family data, so treat the database and deployment as sensitive.

## Secrets and API keys

- Keep `.env.local` out of Git.
- Never put API keys into variables that start with `NEXT_PUBLIC_` unless they are explicitly safe browser/public keys.
- Supabase publishable/anon key is okay client-side only because Row Level Security is enabled.
- Supabase secret/service-role keys must never be exposed to the browser.
- OpenAI, market-data and other provider API keys must only be used server-side.
- Integration tokens saved in the Integrations page are encrypted before being stored in `integration_secrets`.
- Set `APP_ENCRYPTION_KEY` before saving any token: `openssl rand -base64 32`.
- Existing plaintext tokens from earlier builds should be deleted and re-saved after running `db/v20_security_schema.sql`.

## Passwords and personal data

- User passwords are not stored by this app; Supabase Auth handles authentication/password hashing.
- App records such as salary, mortgage balances, childcare costs and transactions are not hashed because the app needs to calculate and display them. They are protected with per-user Row Level Security.
- API tokens are encrypted, not hashed, because the server needs to decrypt and use them for provider calls. A SHA-256 fingerprint is also stored for duplicate/review purposes.

## Database access

- Every user-owned table should contain `user_id` and have RLS enabled.
- The Supabase service-role key is used only by tightly scoped server-side jobs, such as the protected cron route.
- Never use the service-role key in Client Components, browser code, mobile code or `NEXT_PUBLIC_` variables.

## Banking and investments

- Do not store bank passwords.
- Use CSV imports first.
- For live account data, use a regulated Open Banking/Open Finance provider and a consent flow.

## PWA/mobile

- The service worker deliberately does not cache private finance pages or API responses.
- Only static app-shell assets such as icons and the manifest are cached.

## V22 account/admin/notification hardening

- Password storage and reset are handled by Supabase Auth, not by application tables.
- TOTP MFA enrolment is available from `/account`; production projects should verify Supabase MFA settings before allowing real financial data online.
- Notification/email preferences are stored per authenticated user with RLS.
- Admin access is allow-listed through `APP_CREATOR_EMAILS` and/or `app_admin_users`.
- Email run logs store email hashes, not raw recipient emails.
- Scheduled digest routes require `CRON_SECRET` and should not be exposed without it.
- Resend/API provider tokens must stay server-side and must not be stored in `NEXT_PUBLIC_*` variables.
