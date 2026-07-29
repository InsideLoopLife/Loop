# V25 auth, household sharing and module boundary patch

This patch focuses on the account/auth model before more Health work is added.

## Added

- Branded 8 digit password reset code flow.
- Branded 8 digit sign-up verification flow.
- Google / Apple OAuth buttons and callback route.
- Household sharing tab with invite links and QR codes.
- Household join page for existing accounts.
- Server-side invite acceptance using Supabase service role.
- Feature boundary folders for LoopWealth, LoopHealth and shared code.
- Migration: `db/v25_auth_household_sharing_modular.sql`.

## Required env

```env
APP_BASE_URL=http://localhost:3000
SUPABASE_SECRET_KEY=your_supabase_secret_key
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your@email.com
SMTP_APP_PASSWORD=your_new_app_password
EMAIL_FROM="Loop <your@email.com>"
```

For Google/Apple OAuth, configure the providers in Supabase Auth and add `http://localhost:3000/auth/callback` plus your production callback URL when deployed.

## Important

Run the V25 migration after V24.6. The code-based reset/sign-up flow needs `SUPABASE_SECRET_KEY` because it updates/creates Supabase Auth users server-side only.
