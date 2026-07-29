# v28.54 - Opening baseline movement, pension provider status and LoopWatch mini-AI polish

## Why this update exists

Provider previous-close data is inconsistent across markets and providers. For beta, investment daily movement now uses the first Loop price point stored for the current trading session/date. This gives the user a reliable "change since opening/first point" view without blocking on previous-close availability.

## Included changes

- Investment holdings and snapshots store session/opening baseline fields.
- Daily movement is calculated against the first stored Loop price point for the current session/date.
- Previous-close provider data is still retained when available, but it is no longer the primary movement basis in the UI.
- PensionBee, L&G and other pensions show explicit provider refresh status rather than implying an automatic portal pull.
- New pension refresh cron/worker marks stale pension values and keeps fund-row values updated where fund units are present.
- LoopWatch supports pension statements as a first-class document type.
- LoopWatch AI extraction is configured for mini models and does not use web/search tools.
- School term dates/calendars are classified as school documents and avoid random financial-flow suggestions.

## SQL migration

Run:

```sql
db/v28_54_opening_baseline_pension_loopwatch_ai.sql
```

## Optional worker/cron

- Cron route: `/api/cron/pensions-daily`
- Script: `npm run worker:pension-provider-refresh`

Both require the server-side Supabase key. The cron route also requires `CRON_SECRET`.
