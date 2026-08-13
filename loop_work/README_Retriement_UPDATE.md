# LOOP retirement persisted UI update

The Supabase `retirement_plans` table is already live. Copy the three files in this bundle into the same paths.

## Update `app/investments/page.tsx`

1. Add `birth_date: string | null` to the `Person` type.
2. Change the people select to include `birth_date`.
3. Add a `RetirementPlan` type matching `lib/retirement/actions.ts`.
4. Add a `retirementPlansResult` query to the existing Promise.all:

```ts
supabase
  .from("retirement_plans")
  .select("id, user_id, person_id, household_id, scope, retirement_age, target_annual_income, target_legacy_pot, annual_growth_rate_percent, annual_inflation_percent, sustainable_withdrawal_rate_percent, guaranteed_annual_income, created_at, updated_at")
  .eq("user_id", dataOwnerUserId)
  .order("updated_at", { ascending: false }),
```

5. Pass `retirementPlans={retirementPlansResult.data ?? []}` to `PensionsInvestmentsClient`.

## Update `PensionsInvestmentsClient.tsx`

Add imports:

```tsx
import { WealthLandingSummary } from "@/components/investments/WealthLandingSummary";
import { RetirementPlannerPanel } from "@/components/investments/RetirementPlannerPanel";
import { ageFromBirthDate, investmentSourceLines, pensionSourceLines, retirementAssetsFromCurrentWealth, retirementContributionsFromPensions } from "@/lib/retirement/adapter";
import { calculateRetirementPlan, type RetirementPlanProjection } from "@/lib/calculations/retirement";
import type { RetirementPlanRecord } from "@/lib/retirement/actions";
```

Add `birth_date?: string | null` to `Person`. Add `retirementPlans?: RetirementPlanRecord[]` to Props and default it to `[]`. Extend the existing experience union with `"retirement-planner"`.

Add state:

```tsx
const [savedRetirementPlans, setSavedRetirementPlans] = useState<RetirementPlanRecord[]>(retirementPlans);
```

After `pensionTotal` and `investmentTotal` are available, add:

```tsx
const primaryPerson = people.find((person) => ["self", "me", "owner", "primary"].includes(String(person.relationship || "").toLowerCase())) ?? people[0] ?? null;
const primaryCurrentAge = ageFromBirthDate(primaryPerson?.birth_date);
const primaryRetirementPlan = savedRetirementPlans.find((plan) => plan.scope === "person" && plan.person_id === primaryPerson?.id) ?? null;
const pensionSources = pensionSourceLines(pensionAccounts, pensionFunds);
const investmentSources = investmentSourceLines(investmentAccounts, investmentHoldings);
const retirementAssets = retirementAssetsFromCurrentWealth({ pensionAccounts, pensionFunds, investmentAccounts, investmentHoldings });
const retirementContributions = retirementContributionsFromPensions(pensionAccounts);

let retirementProjection: RetirementPlanProjection | null = null;
if (primaryPerson && primaryCurrentAge != null && primaryRetirementPlan && Number(primaryRetirementPlan.retirement_age) >= primaryCurrentAge) {
  retirementProjection = calculateRetirementPlan({
    currentAge: primaryCurrentAge,
    retirementAge: Number(primaryRetirementPlan.retirement_age),
    targetAnnualIncome: Number(primaryRetirementPlan.target_annual_income),
    assets: retirementAssets,
    contributions: retirementContributions,
    targetLegacyPot: Number(primaryRetirementPlan.target_legacy_pot || 0),
    guaranteedAnnualIncome: Number(primaryRetirementPlan.guaranteed_annual_income || 0),
    annualGrowthRatePercent: Number(primaryRetirementPlan.annual_growth_rate_percent || 5),
    annualInflationPercent: Number(primaryRetirementPlan.annual_inflation_percent || 2.5),
    sustainableWithdrawalRatePercent: Number(primaryRetirementPlan.sustainable_withdrawal_rate_percent || 3.5),
  });
}
```

Replace the old repeated overview summary sections with:

```tsx
<WealthLandingSummary
  pensionTotal={pensionTotal}
  pensionSources={pensionSources}
  investmentTotal={investmentTotal}
  investmentSources={investmentSources}
  retirementProjection={retirementProjection}
  retirementAge={primaryRetirementPlan ? Number(primaryRetirementPlan.retirement_age) : null}
  targetAnnualIncome={primaryRetirementPlan ? Number(primaryRetirementPlan.target_annual_income) : null}
  onOpenPensions={() => openPensionCommand()}
  onOpenInvestments={() => openInvestmentCommand()}
  onOpenRetirement={() => setExperience("retirement-planner")}
/>
```

Then add the planner section beside the other experience sections:

```tsx
{experience === "retirement-planner" ? (
  primaryPerson && primaryCurrentAge != null ? (
    <RetirementPlannerPanel
      personId={primaryPerson.id}
      assets={retirementAssets}
      contributions={retirementContributions}
      initialPlan={primaryRetirementPlan}
      initialCurrentAge={primaryCurrentAge}
      onBack={openOverview}
      onSaved={(savedPlan) => {
        setSavedRetirementPlans((current) => [savedPlan, ...current.filter((plan) => plan.id !== savedPlan.id)]);
      }}
    />
  ) : (
    <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6">
      <p className="text-sm font-black text-amber-900">Add a date of birth to use Retirement Planning</p>
      <p className="mt-2 text-sm font-semibold text-amber-800">LOOP needs the person&apos;s age to calculate years to retirement.</p>
    </section>
  )
) : null}
```

The saved record stores assumptions only. Projected pot/income are recalculated from current balances each page load.
