# Migration strategy

The earlier prototype used versioned files like `db/v14_schema.sql` and `db/v20_security_schema.sql`.

V21 starts the formal migration path:

```txt
supabase/migrations/202606130001_platform_core.sql
```

Recommended next step is to install the Supabase CLI and use:

```bash
supabase migration new <name>
supabase db diff
supabase db push
```

Keep `db/v21_platform_schema.sql` for manual Supabase SQL Editor use while still developing locally.
