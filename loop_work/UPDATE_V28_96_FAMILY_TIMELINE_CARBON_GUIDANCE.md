# v28.96 · Family timeline, vehicles and carbon context

## Changed

- Children and pets are created from the Family timeline `+ Add` modal.
- Pets render as species icons with their name and calculated age; date of birth remains available to insurance/watch logic.
- Removed the standalone child-profile and household-pets creation panels.
- Moved carbon improvement into the carbon summary tile.
- Added a carbon context modal with the WWF questionnaire, adoptable food assumptions, offsets and household vehicles.
- Added vehicle mileage, fuel/EV type, MPG, finance and insurance-renewal fields.
- Car finance/lease is separated from travel usage and is never converted to carbon from price.
- Food guidance now starts from ONS household spending evidence and scales household composition gently rather than multiplying large adult/child figures.
- Missing food data says `Adopt assumptions`; adopted assumptions remain visibly labelled as assumed rather than actual.

## Data sources and modelling boundary

- ONS Family Spending FYE 2025 is the baseline for broad household expenditure context.
- DfT National Travel Survey 2024 is the basis for not assuming a car per working adult: 22% of households had no car, 44% had one, and 34% had two or more.
- Ofgem Typical Domestic Consumption Values remain the broad energy sanity check; home-specific details override them.
- UK Government GHG conversion factors are the intended authority for activity-based emissions. The first implementation uses explicit, visible activity approximations and does not present spend-based results as measured emissions.
- WWF is linked as an optional external questionnaire; LOOP does not claim to reproduce WWF's calculation.

## Migration

Run `supabase/migrations/202607171800_household_carbon_vehicles.sql` after the v28.94 and v28.95 migrations. Stop local app/workers while applying migrations to avoid the previously observed DDL deadlock.
