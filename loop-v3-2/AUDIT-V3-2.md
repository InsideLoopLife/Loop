# LOOP V3.2 architecture and rendering integrity

## Navigation/loading
- Persistent authenticated app shell keeps LOOP navigation mounted across route changes.
- Existing per-page `<Nav />` calls become no-ops inside the persistent shell, avoiding duplicate headers.
- Warm route snapshots are memory-only: personal finance page payloads are not persisted in browser storage.
- Hard refreshes still use the authenticated, household-scoped V3 server boot snapshot.
- Dashboard, Investments, Net Worth, Retirement, Income and Nutrition use hybrid warm/cold loading: warm full UI first when available, otherwise the server boot snapshot.

## Investments
The existing API correctly refuses to connect incomplete portfolio snapshots into a potentially misleading line. V3.2 preserves that rule, but now returns the real high-coverage candidate saved snapshots separately as `snapshotEvidencePoints`.

`InvestmentHistoryChart` renders those real saved snapshots as outlined dots. If there is not enough integrity to connect them into a line, the dots are still shown without inventing a trend.

## Savings
The shared Financial Flow “Savings & pots” destination now opens `/financial-flow?tab=savings` instead of bypassing the visual Savings Flow and jumping straight to `/accounts`.

That visual page already contains:
- allocation pie chart
- 24-month recorded/projected trend
- provider/account logos
- savings year calendar
- pot coverage cards
- `SavingsGoalVisual` and user reference images

Detailed management remains linked to `/accounts`.

## Calculation safety
No mortgage, affordability, tax, NI, maternity, ISA, pension valuation/contribution, investment pricing/FX, savings interest/accrual, household ownership, recurrence or provider-mapping formula is changed.
