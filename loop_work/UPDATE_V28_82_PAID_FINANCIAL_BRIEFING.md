# v28.82 — Paid Financial Briefing Landing Page

Adds the entitlement-gated **Your LOOP** landing experience for Pro/Premium users.

## Included
- Welcome-back personalised heading.
- Household net-worth position and weekly/monthly movement.
- Deterministic movement contributors across investments, savings and mortgage reduction.
- AI-style explanatory briefing built only from calculated evidence.
- Three prioritised decisions with confidence labels and deep links.
- Financial Flow allocation visual.
- Portfolio concentration and market-movement panel.
- Savings, home/mortgage and evidence-health panels.
- Daily cached snapshot/briefing tables.
- Protected daily Render cron endpoint and runner.
- Server-side tier gate and automatic paid-user landing redirect.
- Navigation item shown only when `ai_financial_briefing` is enabled.

## Migration
Run `supabase/migrations/202607121200_paid_financial_briefing.sql`.

## Render
Set `APP_BASE_URL` and `CRON_SECRET`. The scheduled job runs daily at 06:20 UTC, after the expected savings and market refresh window.
