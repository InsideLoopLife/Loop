# Admin setup fix for dan@insideloop.life

The screenshot shows:

`No Supabase service-role key is configured, so Loop sent a normal password-reset email instead.`

That means the app can send a reset email only if the admin auth user already exists. It cannot create/recover the admin user server-side without the Supabase service-role key.

## Fix

In `.env.local`, add your real Supabase service-role key:

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY

SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVICE_ROLE_KEY

LOOP_ADMIN_EMAIL=dan@insideloop.life
LOOP_ADMIN_ALLOWLIST=dan@insideloop.life,danielrobertcharlton@gmail.com,gamingnectar@gmail.com
```

Then fully restart localhost:

```bash
npm run dev
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. It must only exist server-side.

## If the admin user does not exist yet

Create it in Supabase Dashboard:

Authentication → Users → Add user

Email:

```txt
dan@insideloop.life
```

Then use the app admin setup page to send the password setup/reset link again.

## Make Dan a super user

If your app has an admin/profile table, run the appropriate update.

Common examples:

```sql
update public.profiles
set role = 'owner'
where email = 'dan@insideloop.life';

update public.people
set role = 'owner'
where lower(email) = lower('dan@insideloop.life');
```

If role is stored in Supabase Auth `app_metadata`, set it from the Supabase dashboard or with a server-only admin call:

```json
{
  "role": "owner",
  "super_user": true
}
```
