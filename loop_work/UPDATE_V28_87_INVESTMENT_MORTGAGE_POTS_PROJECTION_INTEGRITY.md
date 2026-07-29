# LOOP v28.87 — Investment, mortgage, pot and projection integrity

## Investment history

- The command-centre chart no longer draws a false cost-basis-to-current-value cliff.
- When only one complete account snapshot exists, the chart displays a clearly labelled flat current-value baseline until the next complete snapshot arrives.
- Individual ticker/fund history continues to use deterministic market history where available.
- Vanguard LifeStrategy 80 Accumulation (`GB00B4PQW151`) now resolves to its supported Yahoo/Morningstar fund-series code before the generic ISIN candidate, and provider funds are refreshed on a daily cadence rather than being blocked by stock-market-hours logic.
- A fund can still show a stale warning when its publisher has not released a newer daily NAV. LOOP does not invent an intraday price for daily-priced funds.

## Cost basis and provider activity

- SnapTrade cost basis is now marked provider-verified when an explicit total cost, average purchase price or tax-lot payload is returned.
- Missing cost basis remains visible as `COST BASIS NEEDED`; current value is not treated as a genuine purchase cost.
- Provider logo URLs are persisted on holdings with a resilient initials fallback.
- SnapTrade account activity is imported into `investment_provider_activities`.
- BUY, REI/dividend-reinvestment and stock-dividend rows are materialised as idempotent purchase lots when they can be matched to a holding.
- DIVIDEND and other activities remain in the provider ledger for later cash-flow/dividend reporting.

## Diversification transparency

- The diversification graphic represents 100% of invested holdings.
- When there are more than 18 assets, the largest 17 remain visible and the remainder is grouped into an explicit `Other` segment.
- The holdings list has a `Show all` control rather than silently stopping at eight rows.

## Mortgage preferences

- Shortlisting is now optimistic and saved through the existing server action without a browser navigation.
- The panel refreshes its server state after the save and rolls the local state back if persistence fails.
- A starred deal remains the highest-priority comparison; otherwise the first shortlisted deal is used.
- Until a deal is saved, the house bubble uses the estimated follow-on/SVR payment rather than arbitrarily choosing the first market product.

## Savings pots

- The migration adds `reference_image_url`, person, goal and priority fields to `savings_pots`.
- Pot creation also has a compatibility retry that saves the core pot when an older database schema cache has not yet exposed optional visual fields.

## Projection scope

- Savings and pension projections default to the signed-in person.
- The projection page has a `Projection scope` button on the right.
- A modal permits deliberate selection of one or more adults.
- Balances, savings accounts, pension accounts, contribution settings, performance assumptions and ages are recalculated from the selected people.
- Each person displays their own pension contribution evidence and the named income rows used.
- Legacy pension accounts without a person are assigned to the signed-in user's self profile by migration where that profile can be identified.

## Migration

Run:

```text
supabase/migrations/202607132100_v28_87_investment_mortgage_pots_projection_integrity.sql
```

Then restart the app and trigger a SnapTrade refresh plus one forced investment-price worker run so logos, verified cost basis, activities and the Vanguard mapping are populated immediately.
