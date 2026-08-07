# Money optimisation — deferred product work

Status: foundation only. Do not surface prescriptive recommendations yet.

## Next layer

- Build surface-level money optimisation prompts from the complete household evidence set.
- Use the central, per-person ISA allowance position across Cash ISAs, Stocks & Shares ISAs, Lifetime ISAs and Junior ISAs.
- Consider access needs, emergency cash, tax band and Personal Savings Allowance, existing provider eligibility, FSCS grouping, debt/mortgage cost, goals and contribution capacity.
- Explain evidence, assumptions, uncertainty and trade-offs before suggesting an action.
- Keep recommendations informational; require the user to open the detail and decide.
- Add stale-data and incomplete-allowance guards so LOOP never treats an unknown subscription amount as unused allowance.

## Prerequisites now in place

- Versioned UK ISA rules in `lib/wealth/isa-allowance.ts`.
- Person/age eligibility shared by savings matching and investments.
- Per-person current-tax-year known usage shown separately from total ISA balances.
- Dated savings top-ups, completed interest periods and compound projections.

