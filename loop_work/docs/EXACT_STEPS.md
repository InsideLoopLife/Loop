# Exact steps

## 1. Stop trying the reset email for now

You have hit the Supabase email rate limit. The recovery/PKCE route is also not needed for admin bootstrap.

## 2. Add real service-role key

Your `.env.local` must contain the actual Supabase `service_role` JWT, not the placeholder text.

Use:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_SECRET_KEY=eyJ...

LOOP_ADMIN_EMAIL=dan@insideloop.life
LOOP_ADMIN_ALLOWLIST=dan@insideloop.life,danielrobertcharlton@gmail.com,gamingnectar@gmail.com
```

The service-role key is in Supabase:

Project Settings → API Keys → `service_role`

Do not put this key in any file that is exposed to the browser.

## 3. Install/update dependencies

From the project root:

```bash
npm install
```

## 4. Run the direct bootstrap script

```bash
node scripts/bootstrap-admin.mjs dan@insideloop.life "Change-Me-Immediately-123!"
```

Use a stronger temporary password than the example.

## 5. Restart localhost

```bash
npm run dev
```

## 6. Sign in

Go to `/login` and sign in with:

```txt
dan@insideloop.life
```

and the temporary password.

## 7. Change the password

Once signed in, change the password from Account settings.

## Optional SQL healthcheck

Run:

```sql
-- db/v27_57_direct_admin_bootstrap_healthcheck.sql

select * from public.app_v2757_admin_healthcheck();
```
