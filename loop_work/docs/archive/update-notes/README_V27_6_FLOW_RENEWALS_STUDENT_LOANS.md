# V27.6 Financial Flow filters, renewals and student loans

## What changed

- Dashboard committed outgoings by person are now clickable.
- Clicking a person filters the detailed outgoing list on the dashboard.
- Each filtered card includes a direct link into Financial Flow with the same month/person/outgoing-only filter.
- Financial Flow now accepts `month`, `person` and `direction` query params.
- Financial Flow now has a Household / shared filter as well as person filters.
- Timeline lines can be filtered to All, Income only or Outgoings only.
- Monthly costs now support lifecycle/renewal metadata:
  - drop off after end date,
  - likely renews / continues,
  - review before renewal,
  - nudge days,
  - early-upgrade/review date,
  - expected refund / money back.
- If a line has an end/renewal/upgrade date, hover over it in Financial Flow to see the detail.
- Items marked as `renews` or `review_needed` stay in future forecasts instead of disappearing after the contract date.
- Added a Renewal & drop-off watch panel for items due in the next 180 days.
- Added a manual Student Loan tracker to Financial Flow.

## Student loan behaviour

There is no direct Student Loans Company API integration in this patch. The app stores the balance the user copies from their SLC online account, then estimates a possible drop-off month from payroll deduction estimates or a payslip override.

## Required migration

Run:

```sql
-- db/v27_6_financial_flow_clickable_renewals_student_loans.sql
```

## Validation

- `npx tsc --noEmit` passed.
- `npm run build` compiled successfully and reached the TypeScript stage, but the sandbox timed out before the full Next build completed.
