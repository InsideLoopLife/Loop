# V28.77 Household spending + home-usage guidance

This pass adds planning intelligence to the Household Overview page without presenting it as financial advice.

## Core principle

Household guidance should always explain its assumptions. A user should see:

- their actual visible spend,
- LOOP's planning range,
- the inputs used to build that range,
- and which data would make the estimate better.

## New logic

`lib/household/household-guidance.ts` contains pure functions for:

- variable spend planning bands,
- expected energy / gas / water usage,
- summary next steps,
- and assumption transparency.

`lib/household/household-overview-model.ts` now includes:

- `variableSpendGuidance`,
- `homeUsageGuidance`,
- `guidanceSummary`.

The UI consumes these from `components/household/HouseholdOverviewDashboard.tsx`.

## Home usage estimate

The first version uses household size + property style + bedrooms + heating type. It can be upgraded later with:

- live energy bills,
- EPC data,
- council / water region,
- property lookup sources,
- or a WWF-style footprint questionnaire.

## Database foundation

`household_living_profiles` stores the household's home assumptions.

`household_guidance_assumptions` allows a future admin/worker process to update planning bands and source evidence without changing UI code.
