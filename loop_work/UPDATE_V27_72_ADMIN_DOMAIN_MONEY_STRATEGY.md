# v27.72 Admin domain hardening + money strategy/deal tracker

## What this adds

### Admin domain hardening

Adds logic for:

```txt
admin.insideloop.life
app.insideloop.life / insideloop.life
localhost development
```

Admin stays usable locally, but live can enforce that `/admin` only works from the admin subdomain.

Files:

```txt
middleware.ts
lib/admin/domain.ts
lib/admin/audit.ts
app/admin/security/page.tsx
app/admin/security/actions.ts
```

Admin instructions are embedded at:

```txt
/admin/security
```

### Money strategy / savings deal watch

Adds a first version of the money strategy layer:

```txt
/account/money-strategy
/admin/money-deals
/api/money/strategy
/api/cron/money-deal-refresh
```

User flow:

```txt
1. User enters monthly available savings, current cash rate and preferences.
2. Admin adds or imports available savings deals.
3. LOOP matches the user's money agenda against available deals.
4. LOOP shows estimated gross benefit, monthly cap, remaining monthly savings and conditions.
5. LOOP can notify the user when a better deal appears.
```

This is comparison/support logic, not regulated financial advice.

## Run SQL

```sql
db/v27_72_admin_domain_money_strategy.sql
```

Then:

```sql
select * from public.loop_v2772_admin_money_healthcheck();
```

## Environment variables for live

```env
NEXT_PUBLIC_SITE_URL=https://app.insideloop.life
NEXT_PUBLIC_ADMIN_URL=https://admin.insideloop.life
LOOP_PUBLIC_HOSTS=insideloop.life,app.insideloop.life
LOOP_ADMIN_HOSTS=admin.insideloop.life,localhost,127.0.0.1
LOOP_ALLOW_LOCAL_ADMIN=true
LOOP_ENFORCE_ADMIN_HOST=true
LOOP_ADMIN_ALLOWLIST=dan@insideloop.life
LOOP_CRON_SECRET=<long-random-secret>
LOOP_MONEY_DEAL_REFRESH_LIMIT=20
LOOP_MONEY_DEAL_REFRESH_DELAY_MS=750
```

On localhost you can leave:

```env
LOOP_ENFORCE_ADMIN_HOST=false
```

or omit it.

## Supabase instructions

In Supabase Auth → URL Configuration:

```txt
Site URL:
https://app.insideloop.life

Redirect URLs:
http://localhost:3000/**
https://insideloop.life/**
https://app.insideloop.life/**
https://admin.insideloop.life/**
```

## Cron

Money deal refresh endpoint:

```txt
/api/cron/money-deal-refresh
```

Call with:

```bash
curl -H "Authorization: Bearer $LOOP_CRON_SECRET" "https://admin.insideloop.life/api/cron/money-deal-refresh?limit=20&delay_ms=750"
```

This politely checks source URLs. It does not bypass bot protection.
