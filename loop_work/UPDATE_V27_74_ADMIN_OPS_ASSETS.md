# v27.74 Admin operations centre + household property/car assets

## What this adds

### Admin notifications dashboard

```txt
/admin/notifications
```

Covers:

```txt
- Deals needing review, blocked, rate-limited or unknown
- User issues raised from the app
- Product quality: missing images, nutrition, serving, source, confidence
- Investment manual coverage: sources, stocks, markets, check frequency
- SnapTrade status / known issues
- System continuity
- Uptime targets
- Household/auth/cron/security/assets alerts
```

### User issue reporting

```txt
/help/report-issue
POST /api/issues
```

Users can raise issues with:

```txt
area
title
description
page/screen
severity
```

This creates an admin alert.

### Product quality tiles

```txt
/admin/products/quality
```

Shows product tiles with ticks/crosses for:

```txt
image
nutrition
verified source
serving
confidence score
```

### Uptime checker

```txt
/admin/uptime
/api/cron/uptime-checks
```

Targets failing or stale checks create admin alerts.

### Deal AI/news review

```txt
/api/cron/deal-news-review
```

When a deal is blocked/unknown/suspected withdrawn, the system can queue a news/search review. By default it flags admin review unless a search provider is configured.

Optional env:

```env
LOOP_DEAL_NEWS_SEARCH_ENDPOINT=
LOOP_DEAL_NEWS_SEARCH_KEY=
```

### Investment coverage

```txt
/admin/investment-coverage
```

Tracks:

```txt
manual sources
markets covered
stocks referenced
frequency of checks
SnapTrade health
```

Adding a market creates an admin alert for the next build/update.

### Household homes and cars

```txt
/household/assets
/api/household/assets/properties
/api/household/assets/vehicles
```

Property fields include:

```txt
household
address
map/satellite links
EPC fields
council tax band
insurance estimate
schools summary
source statuses
```

Vehicle fields include:

```txt
household
registration/make/model/fuel
annual mileage
MPG or kWh/mile
insurance/tax/maintenance/finance
estimated running cost per year and per mile
```

## SQL

Run:

```sql
db/v27_74_admin_ops_assets.sql
```

Then:

```sql
select * from public.loop_v2774_admin_ops_assets_healthcheck();
```

## Cron

This zip includes an expanded `vercel.json`:

```txt
8:00 daily money-deals-daily
8:15 daily deal-news-review
hourly admin-alerts-refresh
every 15 mins uptime-checks
8:30 daily product-price-refresh
```

Vercel cron is UTC. For exact UK local scheduling, use an external scheduler with Europe/London timezone and the same endpoints.

## Logic note

The deal/news AI logic is deliberately cautious:

```txt
If removed is verified -> hide/withdraw.
If unknown/blocked -> hide from optimisation and flag admin.
If AI/search is not configured -> admin review.
```

This avoids recommending a money optimisation based on a stale or dead savings product.
