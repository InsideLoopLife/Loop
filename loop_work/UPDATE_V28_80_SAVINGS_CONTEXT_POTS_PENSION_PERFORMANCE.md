# LOOP v28.80 — Savings context, guided pots and pension performance

## Included

- One scope-aware savings percentage card rather than household and personal duplicates.
- Savings-only year calendar using deposit, withdrawal and interest ledger activity.
- Current month split into saved, withdrawn, interest and closing balance.
- Provider logos and `this month / total balance` in savings lines.
- “Unassigned equity” wording and a More Context action modal.
- Guided savings-pot journey and practical household templates.
- Category-aware goal visuals plus uploaded/URL inspiration images.
- Pot allocation thread for monthly additions, removals and corrections.
- Daily interest split into provider paid, accrued through yesterday and today estimate.
- Per-person Personal Savings Allowance and tax-band logic.
- Pension contribution fallback from income settings, including employer and NI top-up fields.
- Stored annual 5-year/10-year pension fund performance evidence and low/middle/high projection scenarios.
- Annual pension-performance cron endpoint and runner.
- Full Render daily savings-rate cron code, blueprint and operating guide.
- Savings AI research-question framework.

## Required migration

`supabase/migrations/202607101800_savings_context_pot_journey_pension_performance.sql`

Apply v28.79 first if it has not already been run.
