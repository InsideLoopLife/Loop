# v28.47 — Savings accrual, safer owner edit and market worker hotfix

## Fixed
- Market-data Render worker no longer crashes on boot if `@/lib/snaptrade/sync` is missing from a deploy. Investment price snapshots continue to run; SnapTrade position sync logs a clear skipped reason.
- Market session logic now recognises common exchange holidays for UK, US, Canada and core European venues so the UI does not call holiday closures “live market · stale”.

## Savings UX
- Savings cards now show an estimated accrued balance based on last confirmed balance, AER/rate, and whether interest accrues daily/monthly/annually/at maturity.
- Adding/editing savings accounts records `balance_last_confirmed_value` and `balance_last_confirmed_at` so manual edits reset the baseline safely.
- Edit and delete controls are tucked inside the owner/person popover to reduce accidental taps.
- Owner assignment now uses person/household images where available rather than initials-only pills.

## Database
Run `db/v28_47_savings_accrual_worker_market_hotfix.sql` before deploying the updated app code.
