# V27.4 Financial Flow dates, maternity constraint and dashboard polish

## What changed

- Fixed the maternity pay save error by widening the `pay_events_maternity_pay_mode_check` database constraint to allow the default NHS mode: `nhs_spread_occupational_actual_smp`.
- Added optional homepage preference in Account settings: Breakdown first or Financial Flow first.
- Added money display preference in Account settings: exact pounds/pence or rounded whole pounds.
- Changed salary/maternity displays to show pounds and pence by default.
- Financial Flow headings now read like `Jun 2026 Financial Flow` rather than `Jun 2026 lines for Financial Flow`.
- Pay, planned bill, and nursery/child cost lines now use the selected month’s payment date rather than the original effective/start date.
- Nursery/child costs now have payment timing fields: fixed day, last working day, and weekend/bank-holiday adjustment.
- The dashboard overview now includes committed outgoings by person for the selected month.
- Bill logos now preview while typing:
  - known brands resolve instantly;
  - unknown brands search after a short pause if an OpenAI token is saved;
  - the chosen brand/logo is also saved when the cost is created or updated.
- Budget category monthly budget remains optional/blank.

## Migration

Run this before deploying the new code:

```sql
-- db/v27_4_financial_flow_dates_dashboard_maternity.sql
```

This migration adds:

- `app_user_profiles.dashboard_home_view`
- `app_user_profiles.money_display_precision`
- child-cost payment date fields
- widened maternity pay-mode constraint

## Maternity pay logic note

The default NHS mode is not a simple equal split of salary. It spreads the occupational maternity pay pot across the leave period, then layers SMP into the actual month it falls in. Exact month overrides still win if entered for a payslip/month.
