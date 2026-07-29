# Production readiness plan

This project now has a platform layer for moving from a local prototype to a private hosted app.

## Environments

Use three separate environments:

1. **Local** — development data only.
2. **Staging** — hosted preview, separate Supabase project, fake/limited data.
3. **Production** — real household data, locked down, backups enabled.

Never point local or staging at the production Supabase project.

## Before production

- Run `db/v21_platform_schema.sql`.
- Create a default household from `/platform`.
- Disable public sign-ups in Supabase Auth.
- Set `APP_SIGNUP_MODE=closed` or `invite`.
- Set `APP_ENCRYPTION_KEY` with `openssl rand -base64 32`.
- Set `CRON_SECRET` before enabling deployed cron routes.
- Enable backups and test a restore.
- Keep `SUPABASE_SECRET_KEY` server-only.
- Do not use `NEXT_PUBLIC_` for any secret.

## Deployment checks

Run these before every deployment:

```bash
npm install
npm run lint
npx tsc --noEmit
npm run build
npm audit --production
```

## Data model direction

Everything should eventually fit this structure:

```txt
household
  people
  accounts
  planned items
  transactions
  assets
  liabilities
  homes
  mortgages
  pension funds
  investment holdings
  lifestyle bills
  assumptions
  audit logs
  export jobs
```

Existing tables still use `user_id`. V21 adds nullable `household_id` columns so we can migrate gradually without breaking the current app.
