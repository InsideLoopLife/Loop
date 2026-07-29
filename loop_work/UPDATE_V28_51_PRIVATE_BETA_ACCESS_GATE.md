# v28.51 - Private Beta Access Gate

Full-code update for taking InsideLoop online as a private beta at `https://insideloop.life`, while still allowing local development at `http://localhost:3000` against the same Supabase project.

## What changed

- Added a private beta gate before login/sign-up.
- `/access` and `/beta` show a password-style access-code field.
- Access code is never placed in a URL, public env var, page data, analytics payload or Supabase Auth request.
- Admin-created codes are HMAC/SHA-256 hashed server-side with `LOOP_BETA_CODE_PEPPER`.
- Plain beta codes are not stored.
- Successful code entry sets an HttpOnly, Secure, SameSite=Lax cookie.
- Middleware blocks app/login/signup routes until the beta cookie exists.
- Admin → Beta now manages private beta invite codes.
- Auth callback can mark users as beta-approved if they complete auth with a beta cookie.

## New files

- `app/api/beta/redeem/route.ts`
- `app/beta/page.tsx`
- `db/v28_51_private_beta_access_gate.sql`
- `UPDATE_V28_51_PRIVATE_BETA_ACCESS_GATE.md`

## Updated files

- `app/access/page.tsx`
- `app/access/actions.ts`
- `app/admin/beta/page.tsx`
- `app/admin/beta/actions.ts`
- `app/auth/callback/route.ts`
- `lib/access/beta-gate.ts`
- `lib/navigation/sections.ts`
- `middleware.ts`

## Production env vars

Required for production beta:

```env
LOOP_BETA_GATE_ENABLED=true
LOOP_BETA_CODE_PEPPER=<long-random-server-secret>
LOOP_BETA_COOKIE_SECRET=<different-long-random-server-secret>
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SECRET_KEY=<server-only-secret-or-service-role-key>
NEXT_PUBLIC_SITE_URL=https://insideloop.life
APP_BASE_URL=https://insideloop.life
```

Keep these server-only; do not use `NEXT_PUBLIC_` for the beta pepper, beta cookie secret or Supabase service key.

## Supabase Auth URL checklist

In Supabase Auth settings, add both production and local redirect URLs:

```txt
https://insideloop.life/auth/callback
https://insideloop.life/reset-password/verify
http://localhost:3000/auth/callback
http://localhost:3000/reset-password/verify
```

Set the main Site URL to:

```txt
https://insideloop.life
```

Localhost still works because the local app uses the same Supabase URL/anon key and the allowed redirect list includes localhost.

## Deploy order

1. Run `db/v28_51_private_beta_access_gate.sql` in Supabase.
2. Add production env vars to Render / hosting.
3. Deploy the full code update.
4. Open `https://insideloop.life/access`.
5. Sign in as an admin and go to `/admin/beta`.
6. Create the first invite code.
7. Test the gate in a private browser window.

## Security notes

- The app does not store the original beta access code.
- The access-code input is `type=password`, `autocomplete=off`, `spellcheck=false`.
- Middleware does not validate the code; it only checks the server-issued HttpOnly cookie.
- The access code is not sent to Supabase Auth.
- No request body logging was added.
- Database beta-code tables have RLS enabled and no client policies; code management uses the server-side Supabase admin key only.
