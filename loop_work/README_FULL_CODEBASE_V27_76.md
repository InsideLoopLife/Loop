# LOOP v27.76 Full Codebase - deployment error repair

This is the full integrated codebase with the v27.76 repair included.

It fixes the errors reported after v27.75:

- `numeric field overflow` when adding/editing mortgage records.
- `function gen_random_bytes(integer) does not exist` when creating household QR invites.
- SQL syntax error from `unique (lower(alias))` in the older v27.63 bundled SQL.

## Immediate SQL to run

Run this first if your database already has v27.75 or a partially-failed catch-up run:

```sql
db/v27_76_deployment_error_repair.sql
```

Then verify:

```sql
select * from public.loop_v2776_deployment_error_repair_healthcheck();
```

## Full catch-up SQL

If you are rebuilding/catching up from an older database, use:

```sql
db/RUN_CATCHUP_V27_62_TO_V27_76.sql
```

The older v27.75 catch-up file is still present for reference, but the v27.76 catch-up is the one to use now.

## Why this happened

The app code was newer than parts of the database schema in your Supabase instance. The mortgage form was trying to store normal UK mortgage balances into a column that appears to have been created with a narrower numeric definition in an earlier migration. The household invite RPC also called `gen_random_bytes` without the `extensions` schema in its search path, which can fail on Supabase.
