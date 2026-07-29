# v27.73 Money daily deal watch

## What changed

v27.72 added the money deal library and a manual/source refresh endpoint.  
v27.73 adds the missing daily watch layer:

```txt
/api/cron/money-deals-daily
/admin/money-deals/daily-watch
```

It checks known deal URLs each morning, records what happened, and hides deals from optimisation when they are no longer confidently available.

## Important behaviour

If a deal becomes unavailable:

```txt
first unavailable signal:
status = needs_review
availability_status = suspected_withdrawn
public_visibility = hidden

second unavailable signal:
status = withdrawn
availability_status = withdrawn
public_visibility = hidden
```

So the user will not be shown an optimisation plan for a deal that LOOP can no longer verify.

If a page is blocked/rate limited:

```txt
status = needs_review
availability_status = blocked
public_visibility = hidden
```

This avoids sending a user to a deal that might not be accessible/valid.

## Run SQL

```sql
db/v27_73_money_daily_deal_watch.sql
```

Then:

```sql
select * from public.loop_v2773_money_daily_watch_healthcheck();
```

## Daily 8am schedule

This package includes:

```txt
vercel.json
```

with:

```json
{
  "crons": [
    {
      "path": "/api/cron/money-deals-daily",
      "schedule": "0 8 * * *"
    }
  ]
}
```

Vercel cron uses UTC. That means:

```txt
8am UTC = 8am GMT
8am UTC = 9am BST during British Summer Time
```

If you need exact 8am UK local time all year, use an external scheduler that supports Europe/London and calls:

```bash
curl -H "Authorization: Bearer $LOOP_CRON_SECRET" "https://admin.insideloop.life/api/cron/money-deals-daily"
```

## Env vars

```env
LOOP_CRON_SECRET=<long-random-secret>
LOOP_APP_URL=https://admin.insideloop.life
LOOP_MONEY_DAILY_LIMIT=75
LOOP_MONEY_DAILY_DELAY_MS=1000
LOOP_MONEY_USER_AGENT=InsideLoopMoneyBot/0.1 (support@insideloop.life)
```

## What this can do

```txt
- Check known active/needs_review deals with source URLs.
- Extract rate-like text from source pages.
- Detect common withdrawn/no-longer-available wording.
- Hide suspicious, blocked or withdrawn deals from user optimisation.
- Notify users whose watched/opportunity deals are affected.
- Log every daily run and deal event.
```

## What it cannot do alone

```txt
- Guarantee every UK savings deal exists unless source feeds/pages are configured.
- Bypass bot protection.
- Replace provider terms and eligibility checks.
```

To capture new deals reliably, add:

```txt
- official/commercial money data feeds
- affiliate/comparison feeds
- trusted bank/product source pages
- manual/admin CSV imports
```
