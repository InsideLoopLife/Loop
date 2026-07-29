# V28.57 Moneybox allocation model

Adds a provider-specific Moneybox investment flow.

## What changed

- Selecting Moneybox in the Add Investment Pot modal now switches the submit action to the Moneybox allocation setup flow.
- Existing Moneybox pots now show a **Configure Moneybox allocation** button.
- The Moneybox modal lets the user:
  - search Moneybox funds, ETFs, themed ETFs and cash/unknown allocation;
  - allocate a percentage to each selected asset;
  - validate the total equals 100%;
  - enter contribution amount, frequency, start date and estimated buy delay;
  - enter a current Moneybox total value and value date as a manual anchor.
- Saving creates/updates:
  - the investment account;
  - Moneybox portfolio rule rows;
  - Moneybox allocation rows;
  - inferred investment holdings;
  - generated purchase lots from the contribution cadence;
  - value correction rows and price snapshots when a current total value is supplied.

## Files added

- `lib/investments/moneybox-funds.ts`
- `db/v28_57_moneybox_allocation_model.sql`
- `supabase/migrations/202607061557_moneybox_allocation_model.sql`

## Files changed

- `app/investments/actions.ts`
- `components/investments/PensionsInvestmentsClient.tsx`
- `lib/investments/provider-glossary.ts`

## Important implementation note

Moneybox inferred holdings deliberately save with `price_polling_enabled = false` because the first model uses allocation and contribution assumptions, not confirmed unit quantities. Users can still edit a holding later and enable/refresh market pricing once real units/prices are confirmed.
