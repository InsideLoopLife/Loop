# All pot logic — complete package

Everything from this whole thread of work, in one place: the icon bug,
the emergency-fund essential-spending logic, the wizard click reduction,
and the new adaptive display.

## Files (7)
```
domains/wealth/financial-flow/FinancialFlowPage.tsx
components/financial-flow/SavingsFlowDetail.tsx
components/savings/PiggyPotVisual.tsx
components/savings/SavingsPotJourney.tsx
app/accounts/page.tsx
lib/wealth/savings-intelligence.ts
```

## What each piece does

**1. Icon bug (Piggy vs. goal-specific icon)** — the "Pot coverage" panel
was hardcoding the generic pig regardless of what the pot actually was;
now correctly shows the goal-specific icon (plane for holiday, etc.)
everywhere, matching what the main accounts page already did correctly.
Also cleaned up the dashed "sketchy" outline style for the genuine
fallback case.

**2. Emergency fund logic** — was treating all spending equally
(subscriptions counted the same as a mortgage). Now uses real category
data already in the database to separate genuine essentials (house,
bills, insurance, debt, childcare, car) from discretionary spend
(subscriptions, eating out, fun, holidays) — only essentials count
toward the target.

**3. Wizard click reduction** — 7 steps down to 3. Same data collected,
same server action, every hidden field name verified identical. Added
a "start with a blank pot" option that didn't exist before.

**4. Adaptive display (this session's new work)** — pots that are
genuinely behind pace now surface first, with a clear amber "Behind
pace" badge and a summary line ("2 pots behind pace — shown first
below"). On-track and complete pots sort after. The underlying score
data already existed; it just wasn't being used for anything beyond a
passive badge colour before.

## Verification
All 7 files pass a fresh esbuild syntax check, run together as a
complete set immediately before this delivery.
