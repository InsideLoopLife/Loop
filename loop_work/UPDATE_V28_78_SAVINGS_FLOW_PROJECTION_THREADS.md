# LOOP v28.78 — savings flow, projections, threads and pots

## What changed

- Savings projections now start from each tracked account's current balance, live AER and scheduled top-up rather than a manually typed global growth rate.
- Pension projections derive a money-weighted annual return from up to five years of value snapshots and dated contribution events. If there is not enough history, the UI says that it is using the fallback assumption.
- Pension and savings contributions are compounded monthly. A contribution at the start of January receives twelve months of growth; a December contribution receives one month.
- Projection cards show the household adults' ages at 1, 5, 10, 20 and 30 years. The expandable graph and composition pie split starting pot, contributions and growth.
- Every savings account has a dated ledger baseline. Deposits, withdrawals, interest, fees and balance corrections preserve before/after balances, so the savings chart shows real rises and dips.
- Tracked Accounts has its own chart and monthly totals for money in, money out and interest. Each account has a month-switching Activity Thread.
- Independent pots can be created and linked to one or several accounts using a fixed amount or account percentage.
- Overview now uses LoopWatch, including estimated opportunity cost, rate drag, ISA room, personal savings allowance and Financial Flow prompts.
- AI Optimiser has an account selector, amount slider, time horizon and account-level opportunity-cost priorities.
- Better-rate Watch shows worker health, saved recommendations and the underlying reviewed deal catalogue.
- Provider cards now attempt to load the institution favicon and fall back to branded initials.

## Required database step

Run one of these equivalent SQL files in Supabase SQL Editor:

- `supabase/migrations/202607101030_savings_flow_projection_threads.sql`
- `db/v28_78_savings_flow_projection_threads.sql`

The migration adds ledger fields, backfills one opening balance per existing saver and completes RLS for independent pots.

## Zero-cost local morning rate watch

The existing endpoint remains `/api/cron/savings-rate-watch` and `vercel.json` already schedules it for 08:00 when deployed on a platform that supports the cron entry.

For the current localhost setup, keep the Next app running in one terminal:

```bash
npm run dev
```

Run the free local worker in a second terminal:

```bash
npm run worker:savings-rates
```

It calls the endpoint every day at 08:00 Europe/London. The laptop must be awake and both processes must remain running. To test immediately:

```bash
npm run watch:savings-rates
```

Optional environment variables:

```env
APP_BASE_URL=http://localhost:3000
CRON_SECRET=your-existing-secret
SAVINGS_WATCH_TIMEZONE=Europe/London
SAVINGS_WATCH_CRON=0 8 * * *
RUN_ON_START=true
```

No paid data API is introduced. The worker compares rows already gathered into `savings_rate_deals`; catalogue quality still depends on the reviewed source rows and refresh logic.
