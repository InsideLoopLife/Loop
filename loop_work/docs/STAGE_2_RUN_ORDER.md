# Stage 2 run order

## 1. Supabase dashboard settings

Before running the app publicly:

1. Authentication → URL Configuration
   - Site URL: `https://insideloop.life`
   - Redirect URLs:
     - `https://insideloop.life/auth/callback`
     - `https://insideloop.life/app`
2. Authentication → Providers
   - Keep Email enabled for beta users.
   - Disable Google/Apple until you are ready, or keep them hidden behind the beta gate.
3. Authentication → Email Templates
   - From/reply-to should use `notifications@insideloop.life` once domain auth is configured.
4. Disable public self-service signup if available on your current Supabase auth setup.
   - During beta, account creation should happen only through `/api/beta/register` or admin invites.

## 2. Run SQL in this order

In Supabase SQL Editor:

```sql
-- 1
-- paste and run supabase/sql/00_stage2_core_tables.sql

-- 2
-- paste and run supabase/sql/01_rls_audit_lockdown_and_policies.sql

-- 3
select * from security.loop_rls_report();

-- 4 dry run
select * from security.loop_enable_rls_on_public_tables(false);

-- 5 apply
select * from security.loop_enable_rls_on_public_tables(true);

-- 6 dry run owner policies
select * from security.loop_create_owner_policies(false);

-- 7 apply if the dry-run statements look correct
select * from security.loop_create_owner_policies(true);

-- 8 optional household policies if you have household_members + household_id tables
select * from security.loop_create_household_policies(false);
select * from security.loop_create_household_policies(true);

-- 9 purge function
-- paste and run supabase/sql/02_account_purge.sql

-- 10 final report
select * from security.loop_rls_report();
```

## 3. Create first owner/admin

After your own Supabase user exists, run:

```sql
update public.profiles
set role = 'owner'
where email = 'dan@insideloop.life';
```

The backend admin middleware reads `app_metadata.role` first, then `user_metadata.role`.

## 4. Deploy backend routes

Mount:

```js
app.use('/api/beta', betaAccessRoutes);
app.use('/api/account', accountPurgeRoutes);
app.use('/api/admin/security', securityAdminRoutes);
```

Set the `.env.insideloop.example` values on your host.

## 5. Deploy landing page

Use `frontend/landing` as the public homepage for `https://insideloop.life`.

Replace:

```js
supabaseUrl: "YOUR_SUPABASE_URL"
supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY"
```

with your actual public Supabase values.

## 6. Generate beta codes

Call:

```http
POST /api/beta/admin/access-codes
Authorization: Bearer <admin_supabase_access_token>
Content-Type: application/json

{
  "count": 20,
  "maxUses": 1,
  "label": "Friends and family beta",
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```

Raw access codes are only shown once.
