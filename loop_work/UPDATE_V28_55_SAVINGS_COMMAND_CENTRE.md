# v28.55 - Savings Command Centre

## Summary

This update restructures `/accounts` into a tabbed savings command centre:

- Overview
- Tracked accounts
- Your banks
- Better-rate watch
- AI score
- Projection
- Add account

## Product logic added

### Provider relationship logic

Tracked savings accounts now feed the user's provider relationship list. If a user adds a saver with `provider_slug`, LOOP automatically upserts that provider into `user_financial_provider_relationships` as `relationship_type = savings_account`.

This means Better-rate watch and AI savings watch can use both:

1. banks manually selected in "Your banks"
2. providers implied by tracked savings accounts

### Better-rate watch

The page now splits savings deals into:

- Likely eligible now
- Could unlock with another provider

It estimates the annual uplift against the user's current balances/rates where possible.

### AI savings score

The AI score tab is a deterministic beta scoring layer that can be upgraded to model commentary later. It checks:

- rate gap against eligible deals
- ISA usage prompt
- non-ISA interest tax prompt
- monthly surplus from Financial Flow
- stale savings balances
- provider eligibility coverage
- top-up consistency

It is labelled as a Pro/paid-tier optimiser when the `savings_rate_watch` feature is enabled.

### Movement logs

Each tracked savings account can now log:

- money added
- money removed
- interest paid
- fee / charge
- balance correction

Adding a movement updates the account's confirmed balance baseline. Deleting a savings account cascades and removes movement history to save space.

### Projections

Added a client-side scenario planner to toggle savings, pensions and top-ups on/off. This uses current savings balance/top-ups plus pension value/fixed contributions.

## Database

Run:

```sql
db/v28_55_savings_command_centre.sql
```

This adds `savings_account_movements`, repairs provider relationship uniqueness, seeds provider relationships from existing tracked savings accounts, and adds a beta flag marker.

## Checks

- `npm ci` completed.
- `next build` compiled successfully then timed out during the existing full TypeScript stage.
- `tsc --noEmit` shows no errors from the changed savings files after fixes; remaining errors are pre-existing elsewhere in nutrition, shopping, planning, mortgage and user-tier files.
