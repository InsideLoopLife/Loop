# LOOP v28.22 — Google / Apple login + welcome email

## What changed

- Google and Apple buttons are now visible on Login and Signup by default.
- Both buttons use Supabase `signInWithOAuth` and return through `/auth/callback`.
- OAuth and email/password account creation now attempt to send the LOOP welcome email once per user.
- Added `welcome_email_sent_at`, `signup_provider`, `last_login_provider` and `last_login_at` support on `app_user_profiles`.
- Added a reusable `Welcome to LOOP` email template in Admin > Email formats.
- Added Admin > Future integrations checklist rows for Google OAuth, Apple OAuth and welcome email testing.

## SQL

Run:

```sql
db/v28_22_social_login_welcome_email.sql
```

Run this before beta testing the welcome email. If the SQL has not run, the app will not auto-send a welcome email on every login because it cannot safely de-duplicate sends.

## Environment flags

Social login is now enabled in the UI by default. To hide either provider temporarily, set:

```env
NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false
NEXT_PUBLIC_ENABLE_APPLE_AUTH=false
```

For normal beta testing, do not set those flags to false.

## Supabase setup

### Redirect URL allow-list

Add these to Supabase Auth > URL Configuration > Redirect URLs:

```txt
http://localhost:3000/auth/callback
https://inside.loop-or-your-domain.com/auth/callback
https://www.insideloop.life/auth/callback
https://insideloop.life/auth/callback
```

Use the exact domains you deploy. OAuth providers will only return to allow-listed URLs.

### Google

1. Create/configure a Google OAuth client in Google Cloud Console.
2. Add the Supabase callback URL shown in Supabase Auth > Providers > Google to Google’s authorised redirect URIs.
3. Add the Google Client ID and Client Secret to Supabase Auth > Providers > Google.
4. Enable the Google provider.
5. Test `/login` and `/signup`.

### Apple

1. Use Apple Developer to create/configure a Service ID for web sign-in.
2. Add the Supabase callback URL shown in Supabase Auth > Providers > Apple to Apple’s return URLs.
3. Add the Apple credentials to Supabase Auth > Providers > Apple.
4. Enable the Apple provider.
5. Test `/login` and `/signup`.

## Welcome email

The email is sent through the existing `sendTransactionalEmail` path, so it uses the current email provider config:

- Resend when `RESEND_API_KEY` is set.
- SMTP when `EMAIL_PROVIDER=smtp` or SMTP variables are present.

Recommended production values:

```env
APP_BASE_URL=https://insideloop.life
EMAIL_FROM="LOOP <hello@insideloop.life>"
EMAIL_REPLY_TO="hello@insideloop.life"
```

## Safety

- Welcome emails are de-duplicated by `app_user_profiles.welcome_email_sent_at`.
- If the de-dupe column is missing, auto-send is skipped rather than repeatedly emailing returning users.
- OAuth callback still links pending household invites by verified email.
