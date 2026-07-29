# v28.52 - Supabase beta SQL repair and Security Advisor hardening

## Why

Supabase logs showed repeated:

```txt
42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification
```

The beta gate migration used `ON CONFLICT` against existing tables that should have unique keys, but some older/local databases can have those tables without the expected unique indexes because earlier migrations were run partially or out of order.

## Run order

1. Run `db/v28_52_beta_sql_constraint_repair.sql`.
2. Re-run `db/v28_51_private_beta_access_gate.sql` only if you want to verify it is now clean. It should no longer hit `42P10`.
3. Optionally run `db/v28_52_optional_security_advisor_hardening.sql` to reduce Security Advisor warnings.

## What the repair does

- Creates Supabase CLI migration tracking table if it is missing.
- Ensures these conflict targets exist:
  - `app_beta_flags(flag_key)`
  - `wealth_watch_settings(setting_key)`
  - `app_future_integration_tasks(product_key, task_key)`
- Deduplicates existing rows before adding unique indexes.
- Reseeds the v28.51 private-beta settings/tasks.

## Security Advisor notes

The optional security hardening:

- Pins `search_path` on public functions.
- Revokes unsigned/anon execute on public `SECURITY DEFINER` functions and grants to signed-in users.
- Sets known security-definer views to `security_invoker` where supported.
- Moves `pg_trgm` into `extensions` if available.

Storage bucket listing warnings need a bucket-policy review rather than an automatic blind migration, because avatars/household images may intentionally be public-readable while still needing listing blocked.
