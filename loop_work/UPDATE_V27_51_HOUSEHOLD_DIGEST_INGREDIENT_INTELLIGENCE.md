# v27.51 Household digest-safe rebuild + ingredient intelligence empty-state

## Why this exists

This fixes the Supabase migration error:

```txt
function digest(text, unknown) does not exist
```

Supabase projects can expose `pgcrypto.digest()` in different schemas. The new migration creates a safe helper `public.app_sha256(text)` and uses that everywhere in the household invite RPCs.

It also adds the ingredient intelligence empty-state flow: when an ingredient/product info link opens `/nutrition/ingredients?q=...` and nothing exists yet, the page now offers a **Create ingredient intelligence** form. This creates a starter record and queues enrichment so the database can improve over time.

## Run order

1. Replace files with this zip.
2. In Supabase SQL editor run:

```sql
-- db/v27_51_household_digest_safe_rebuild.sql
```

3. Verify:

```sql
select * from public.app_household_healthcheck();
```

Every row should be `ok = true`.

4. Restart localhost:

```bash
npm run dev
```

## Test cases

- Accept a household invite link again.
- Create a household from Account.
- Send a household invite.
- Open an ingredient info link that has no record yet, e.g. `/nutrition/ingredients?q=ZOE%20Daily%2030%2B`.
- Press **Create ingredient intelligence**.
- Confirm the item appears as a starter `ai_seed_pending` record.

## Notes

If Supabase still says pgcrypto/digest is unavailable, enable `pgcrypto` in Supabase Dashboard → Database → Extensions, then rerun the migration.
