# LOOP v28.79 — Savings intelligence, interest, pots and Financial Flow

## Savings interest and account threads

- Confirmed interest is read from the savings movement ledger.
- Unconfirmed interest is estimated from each account's current AER, confirmed balance and accrual behaviour.
- Daily-accrual accounts show a daily estimate; monthly/annual accounts show accrued interest until the provider confirms payment.
- Overview, tracked accounts and Financial Flow all show confirmed + estimated interest without writing estimates into the confirmed ledger.

## Tax and optimiser

- Active income records are version-deduplicated before the tax-band heuristic is calculated, preventing historical pay rows inflating gross income.
- LoopWatch and the AI optimiser show Personal Savings Allowance, expected non-ISA interest, taxable excess, estimated tax, ISA room and the approximate cash amount to shelter.
- The optimiser explains the difference between the whole-portfolio blended rate and the selected account rate.
- Score categories and the slider purpose are now explicit.

## Pension projection

- Income settings now capture employer pension %, fixed employer monthly contributions and optional employer NI-saving top-ups for salary sacrifice.
- Projection contributions use current income settings where complete, otherwise recent actual contribution history is preferred.
- Monthly contributions are compounded only for the months they are actually invested.
- The result donut uses semantic pastel colours and separates starting pot, savings contributions, pension contributions and growth.

## Pots

- Pot creation is goal-led and visually centred on a piggy-bank silhouette.
- Target dates calculate the monthly amount required automatically.
- Progress uses green for previously filled, orange for the current month's logged contribution and transparent space for the remaining target.
- The on-track score runs from red through amber to green and recalculates from the target pace.
- Optional reference image URLs are supported.

## Financial Flow savings

- Adds household and selected-person savings rates, blended saver rate, confirmed/estimated monthly interest, leftover cash and a clickable year-calendar preview.
- Adds savings allocation and trend charts.
- Account lines show saved this month, interest rate, maximised score and end date.
- Pot coverage uses pig-fill tiles and highlights the current month's contribution.
- The full year calendar opens as a modal.

## Daily rates catalogue

- Adds product provenance, version history and lifecycle states.
- One missing observation becomes `PENDING_WITHDRAWAL`; three consecutive missing/stale observations are required for `WITHDRAWN`.
- Adds a Render cron blueprint that safely targets 08:00 Europe/London across GMT/BST by scheduling at both 07:00 and 08:00 UTC and accepting only the true local 08:00 run.

## Required SQL

Run:

```text
supabase/migrations/202607101430_savings_intelligence_interest_pots_flow.sql
```
