# Architecture

## Current stack

- Next.js App Router
- Supabase Auth
- Supabase Postgres
- Supabase Row Level Security
- Encrypted integration-token storage
- Server-side API routes for OpenAI/market/property research

## Core object model

```txt
app_households
  app_household_members
  household_people
  pay_events
  planned_items
  spending/bank imports
  homes + mortgages
  pension accounts/funds
  investment accounts/holdings
  lifestyle bills/meals
  assumptions
  audit logs
  export jobs
```

## Scaling rules

1. New financial/lifestyle tables must include `user_id`.
2. New shareable tables should include nullable `household_id` now.
3. Every private table must enable RLS.
4. Server-only routes can use privileged keys; client components cannot.
5. External API tokens are encrypted at rest and decrypted only inside server code.
6. Any important create/update/delete should either use the DB audit trigger or manually write a privacy-preserving audit event.

## Deployment shape

```txt
Vercel app
  Server components/actions
  API routes
  Cron routes protected by CRON_SECRET

Supabase
  Auth
  Postgres
  RLS policies
  Storage later for private uploads
  Backups/PITR when live data is used
```
