# v29.04 — savings ledger and ISA allowance foundation

- The existing daily savings run now backfills due monthly top-ups and completed monthly interest periods with deterministic movement IDs, so reruns cannot duplicate them.
- Current incomplete interest remains explicitly estimated; completed periods appear in account threads and chart history.
- Savings charts and account cards include due ledger events and compound future growth.
- Adult Cash ISA and Junior ISA eligibility is determined from the account owner relationship and birth date.
- Persisted recommendations made by older matching logic are expired when they no longer match the owner.
- UK ISA limits are versioned by tax year in one module and used by both savings and investments.
- Savings shows known current-year subscriptions by person; it no longer treats the whole ISA balance as current-year allowance usage.
- Future optimisation work is tracked in `docs/TODO_MONEY_OPTIMISATION.md` and remains deliberately inactive.

No SQL migration is required. Scheduled movement IDs are deterministic UUIDs and use the existing ledger schema.

