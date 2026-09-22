# LOOP tier / entitlement application wiring

This bundle is designed for the current `loop_work` Next.js app and the
Supabase entitlement RPC that is already present:

`public.app_check_feature_access(p_feature_key, p_quantity, p_consume, p_user_id)`

Copy the folders in this bundle into the root of `loop_work/`.

## 1. Add the four files

- `lib/access/feature-keys.ts`
- `lib/access/feature-entitlements.ts`
- `components/access/FeatureGate.tsx`
- `components/access/FeatureAllowance.tsx`
- `components/admin/PlainEnglishTierFeatureCell.tsx`

No database migration is needed for these files.

## 2. UI visibility: page / card / nav

```tsx
import { FeatureGate } from "@/components/access/FeatureGate";
import { LOOP_FEATURES } from "@/lib/access/feature-keys";

<FeatureGate feature={LOOP_FEATURES.AI_FINANCIAL_BRIEFING}>
  <FinancialBriefingCard />
</FeatureGate>
```

If a feature is configured as hidden for the user's tier, nothing renders.

For a visible-but-unavailable state:

```tsx
<FeatureGate
  feature={LOOP_FEATURES.AI_CHAT}
  unavailable={
    <div className="rounded-2xl border p-4">
      You've used this month's AI allowance.
    </div>
  }
>
  <AskLoop />
</FeatureGate>
```

The UI gate is NEVER the security boundary. The server action/API must check
again.

## 3. Metered AI action: consume exactly once

Use the canonical `ai_chat` entitlement immediately before the expensive model
call:

```ts
"use server";

import {
  consumeFeature,
  FeatureAccessError,
} from "@/lib/access/feature-entitlements";
import { LOOP_FEATURES } from "@/lib/access/feature-keys";

export async function askLoop(input: string) {
  try {
    const allowance = await consumeFeature(LOOP_FEATURES.AI_CHAT, 1);

    // Call the model only after allowance has been atomically reserved.
    const answer = await runYourExistingAiCall(input);

    return {
      ok: true,
      answer,
      allowance: {
        remaining: allowance.remaining,
        resetAt: allowance.period_end,
      },
    };
  } catch (error) {
    if (error instanceof FeatureAccessError) {
      return {
        ok: false,
        code: error.status === 429 ? "ALLOWANCE_EXHAUSTED" : "FEATURE_BLOCKED",
        message: error.message,
        access: error.access,
      };
    }
    throw error;
  }
}
```

Do NOT separately consume `ai_monthly_spend_cap` as a "question". It is a
different control and must not double-count AI questions.

## 4. Route handler example

```ts
import {
  consumeFeature,
  featureErrorResponse,
} from "@/lib/access/feature-entitlements";
import { LOOP_FEATURES } from "@/lib/access/feature-keys";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const allowance = await consumeFeature(LOOP_FEATURES.INVESTMENT_LOOKUP, 1);

    const result = await runExistingInvestmentLookup(body);

    return Response.json({
      ok: true,
      result,
      allowance: {
        remaining: allowance.remaining,
        resetAt: allowance.period_end,
      },
    });
  } catch (error) {
    const accessResponse = featureErrorResponse(error);
    if (accessResponse) return accessResponse;
    throw error;
  }
}
```

## 5. Realtime market data is NOT an investment lookup

Do not consume `investment_lookup` when a chart refreshes or receives a market
price.

```ts
import { requireFeature } from "@/lib/access/feature-entitlements";
import { LOOP_FEATURES } from "@/lib/access/feature-keys";

await requireFeature(LOOP_FEATURES.MARKET_DATA_REALTIME);

// Continue with realtime quote/stream logic.
// No investment_lookup usage event is written.
```

This is the separation we wanted: search/research quota and realtime market
access cannot accidentally drain one another.

## 6. Static capacity example

For things such as household member limits, `limit_period='none'` is a maximum
capacity, not a usage meter.

```ts
import { requireFeatureCapacity } from "@/lib/access/feature-entitlements";
import { LOOP_FEATURES } from "@/lib/access/feature-keys";

const currentHouseholdMembers = 3;

await requireFeatureCapacity(
  LOOP_FEATURES.HOUSEHOLD_MEMBERS,
  currentHouseholdMembers + 1,
);

// Only now create the fourth member.
```

Do NOT call `consumeFeature()` for static capacities.

## 7. Show remaining allowance

```tsx
import { FeatureAllowance } from "@/components/access/FeatureAllowance";
import { LOOP_FEATURES } from "@/lib/access/feature-keys";

<FeatureAllowance feature={LOOP_FEATURES.AI_CHAT} />
```

For the current Pro configuration this renders from the database's actual
monthly limit/usage rather than a hard-coded number.

## 8. Simplify `/admin/tiers`

The current page already calls the correct RPCs through
`app/admin/tiers/actions.ts`.

At the top of `app/admin/tiers/page.tsx` add:

```tsx
import { PlainEnglishTierFeatureCell } from
  "@/components/admin/PlainEnglishTierFeatureCell";
```

Find the place where the current page renders:

```tsx
<PlanFeatureCell plan={plan} row={row} cell={cell} />
```

Replace it with:

```tsx
<PlainEnglishTierFeatureCell
  planSlug={plan.slug}
  featureKey={row.feature_key}
  featureName={row.name}
  cell={cell}
/>
```

You can then delete the old local `PlanFeatureCell` function once there are no
references to it.

The new editor puts the normal controls first:

- Include feature
- Allowance
- Reset cadence

and moves these into **Advanced**:

- block / upgrade / warn / audit
- health status
- custom unavailable message

This uses the existing `saveUserFacingPlanFeature` action, so there is no
second admin configuration path.

## 9. Feature keys currently in Supabase

Use the constants in `LOOP_FEATURES`. The important separations are:

- `ai_chat` — metered AI questions
- `investment_lookup` — metered investment lookup/research
- `market_data_realtime` — realtime market access, not a lookup quota
- `ai_financial_briefing` — financial briefing visibility/access
- `household_members` — static capacity example
- `stock_pairing` / `investment_merged_charts` — static feature capacities

## 10. Build check

From `loop_work`:

```bash
npm run build
```

Then verify:

```bash
git status
git diff --check
git add lib/access components/access components/admin/PlainEnglishTierFeatureCell.tsx app/admin/tiers/page.tsx
git commit -m "Wire tier entitlements through application"
git push origin main
```

## Enforcement rule

The rule for LOOP should now be:

**UI check for experience. Server check for security. Atomic consume for
metered work.**

Never rely on:
- a disabled button,
- a hidden component,
- a client-side tier name,
- or a hard-coded "Pro" check

to protect a paid or limited action.
