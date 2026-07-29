# LOOP v27.77 SQL audit / repair

## What I checked

I inspected the v27.76 full-codebase SQL bundle around the problem areas you mentioned:

```txt
v27_58 through v27_76
v27_72_admin_domain_money_strategy
v27_73_money_daily_deal_watch
v27_74_admin_ops_assets
v27_75_property_estimate_mode
RUN_CATCHUP_V27_62_TO_V27_76
```

## What the errors mean

The errors are consistent with a database that has had **some migrations applied, some failed, and some older versions attempted manually**.

Main issues found/covered:

```txt
1. Old catch-up SQL had invalid PostgreSQL syntax: unique(lower(alias)).
2. Mortgage columns were too narrow in an older schema, causing numeric field overflow.
3. Household QR/open invite was calling gen_random_bytes(integer) without the right schema.
4. v27_72–v27_75 are order/dependency sensitive if run manually after partial failures.
5. Some tables/functions are expected by app code even if an earlier SQL file failed halfway.
```

## What to run now

Run only this repair file:

```sql
db/v27_77_single_safe_sql_repair.sql
```

Then run:

```sql
select * from public.loop_v2777_sql_audit_repair_healthcheck();
```

You want every row to show `ok = true`.

## Do not run these again manually first

```txt
v27_72_admin_domain_money_strategy.sql
v27_73_money_daily_deal_watch.sql
v27_74_admin_ops_assets.sql
v27_75_property_estimate_mode.sql
RUN_CATCHUP_V27_62_TO_V27_75.sql
```

The repair script creates/repairs the required objects in one safer pass.

## After running

Test:

```txt
/mortgage
/household
/admin/notifications
/admin/property-sources
/account/money-strategy
```

If anything still errors, send the exact Supabase SQL error line/message and I’ll patch that specific object.


## v27.77B patch

The earlier repair could stop if `public.gen_random_bytes(integer)` already existed but was not detected by the first existence check. This version uses `to_regprocedure('public.gen_random_bytes(integer)')` and swallows `duplicate_function`, so the script continues safely.
