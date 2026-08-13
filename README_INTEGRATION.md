# LOOP Pensions & Investments landing redesign

This bundle adds three reusable pieces:

1. `WealthLandingSummary.tsx`
   - Three large clickable cards: Pension, Investments, Retirement Planning.
   - Pension and investment cards show the current total in the centre and the top three sources underneath.
   - Retirement card shows projected pot, estimated sustainable annual income, and gap to target.

2. `RetirementPlannerPanel.tsx`
   - User can change current age, retirement age and target annual income.
   - Advanced assumptions expose growth, inflation and sustainable-withdrawal assumptions.
   - Results recalculate immediately using `lib/calculations/retirement.ts`.

3. `retirement-summary-adapter.ts`
   - Converts existing pension/investment account data into summary rows and retirement-engine assets.

## Integration point

In `components/investments/PensionsInvestmentsClient.tsx`:

Add imports:

```tsx
import { WealthLandingSummary } from "@/components/investments/WealthLandingSummary";
import { RetirementPlannerPanel } from "@/components/investments/RetirementPlannerPanel";
import {
  pensionSourceLines,
  investmentSourceLines,
  retirementAssetsFromCurrentWealth,
  retirementContributionsFromPensions,
} from "@/lib/calculations/retirement-summary-adapter";
import { calculateRetirementPlan } from "@/lib/calculations/retirement";
```

Extend the `experience` state/type with `"retirement-planner"`.

Near the existing totals, derive:

```tsx
const pensionSources = pensionSourceLines(pensionAccounts, pensionFunds);
const investmentSources = investmentSourceLines(investmentAccounts, investmentHoldings);

const retirementAssets = retirementAssetsFromCurrentWealth({
  pensionAccounts,
  pensionFunds,
  investmentAccounts,
  investmentHoldings,
});

const retirementContributions = retirementContributionsFromPensions(pensionAccounts);
```

For the first version, do not guess a user's current age. Either:
- pass a real DOB-derived age from the household/profile data, or
- show the planner setup state until the user provides age.

Replace the current repeated `experience === "overview"` summary sections with:

```tsx
<WealthLandingSummary
  pensionTotal={pensionTotal}
  pensionSources={pensionSources}
  investmentTotal={investmentTotal}
  investmentSources={investmentSources}
  retirementProjection={savedRetirementProjection}
  retirementAge={savedRetirementAge}
  targetAnnualIncome={savedTargetAnnualIncome}
  onOpenPensions={() => openPensionCommand()}
  onOpenInvestments={() => openInvestmentCommand()}
  onOpenRetirement={() => setExperience("retirement-planner")}
/>
```

Then render the planner when selected:

```tsx
{experience === "retirement-planner" ? (
  <RetirementPlannerPanel
    assets={retirementAssets}
    contributions={retirementContributions}
    initialCurrentAge={realCurrentAge}
    initialRetirementAge={savedRetirementAge ?? 67}
    initialTargetAnnualIncome={savedTargetAnnualIncome ?? 30000}
    onBack={openOverview}
  />
) : null}
```

## Important next database step

Persist user-specific retirement settings instead of keeping them only in component state.

Suggested table:

```sql
create table if not exists public.retirement_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  person_id uuid null,
  scope text not null default 'person' check (scope in ('person','household')),
  retirement_age numeric not null,
  target_annual_income numeric not null,
  target_legacy_pot numeric not null default 0,
  annual_growth_rate_percent numeric not null default 5,
  annual_inflation_percent numeric not null default 2.5,
  sustainable_withdrawal_rate_percent numeric not null default 3.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Add the same household/user RLS pattern already used by LOOP before using this in production.

## Product wording

The UI deliberately says **estimated sustainable annual income**, not "income you can withdraw without the pot decreasing". Markets are variable, so the latter would be a guarantee LOOP cannot safely make.
