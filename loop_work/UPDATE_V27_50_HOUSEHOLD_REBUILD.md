# v27.50 — Household Rebuild

This rebuilds the household invite/join/create/member-management layer around Supabase RPCs so localhost no longer needs a service-role key for household actions.

## What changed

- Drops old household RPCs before recreating them to fix PostgreSQL `cannot change return type of existing function` errors.
- Rebuilds:
  - `app_get_or_create_household`
  - `app_create_household_invite`
  - `app_household_invite_preview`
  - `app_accept_household_invite`
  - `app_accept_person_invite`
  - `app_update_household_member_role`
  - `app_remove_household_member`
  - `app_leave_household`
- Adds `app_household_healthcheck()`.
- Household create/invite/join now uses Supabase signed-in user RPCs instead of `createAdminClient()`.
- `lib/supabase/admin.ts` now ignores obviously invalid service-role keys, which stops a bad `.env.local` value from causing `Invalid API key` in normal household flows.
- Invite tokens are hex/URL-safe and can be accepted by token, short code, or invite id.

## Run order

Run this in Supabase SQL editor:

```sql
-- Full rebuild migration
-- paste/run db/v27_50_household_rebuild.sql
```

Then verify:

```sql
select * from public.app_household_healthcheck();
```

Every row should show `ok = true`.

## Local env cleanup

If you have a bad/old Supabase service key in `.env.local`, remove it while developing locally:

```bash
# remove or leave blank unless it is a real Supabase service_role JWT
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
```

The household module no longer needs these for create/join/invite.

## Test checklist

1. Restart localhost.
2. Go to Account → Household.
3. Create household if needed.
4. Generate an invite to another email.
5. Open the invite link while signed in as the invited user.
6. Accept invite.
7. Confirm the invited user appears in Household members.
8. Confirm Account dropdown shows Household.
9. Change a member role.
10. Remove a test member.
11. Have a non-owner leave a household.


## Optional smoke test SQL while signed in in the app

After running the migration and restarting localhost, use the UI to create/invite/join. You can also run:

```sql
select * from public.app_household_healthcheck();
```

If Supabase still shows `Invalid API key`, clear any bad local value for `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`; household flows now use authenticated RPCs and do not require that key locally.
