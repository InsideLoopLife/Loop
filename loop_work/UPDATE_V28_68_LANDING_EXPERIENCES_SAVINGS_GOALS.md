# UPDATE v28.68 — Landing Experiences + Savings Pot Goals

## Summary
Adds reusable landing/onboarding experiences across the core Loop pages and introduces goal-aware savings pots.

The goal is to keep first-time users from landing on dense, empty dashboards. Each page now gives a friendly explanation of what to add first, why it matters, and how the page becomes more useful as data builds.

## Landing experiences added

New shared component:

- `components/landing/PageLandingExperience.tsx`

Landing states are now available for:

- Overview / dashboard
- Financial Flow
- Income
- Spending
- Savings / accounts
- House / mortgage
- Investments
- Net Worth
- LoopWatch
- Nutrition
- Lifestyle

The component supports:

- page-specific copy
- primary and secondary CTA buttons
- lightweight illustration styles
- compact mode for empty panels
- soft Loop-style gradients and rounded cards

## Savings page changes

Savings now has a stronger first-run experience:

- piggy-bank style onboarding panel
- clear CTA: add a savings account
- explanation that each saver can become a goal-aware pot
- less overwhelming when no accounts exist

## Savings pot goal logic

Savings/cash accounts now support optional goal metadata:

- `savings_goal_name`
- `savings_goal_target_amount`
- `savings_goal_target_date`
- `savings_goal_monthly_contribution_override`
- `savings_goal_priority`
- `savings_goal_status`

Added migration:

- `supabase/migrations/202607072015_landing_experiences_savings_goals.sql`

## Savings goal calculations

`app/accounts/page.tsx` now calculates, per account/pot:

- current estimated balance
- target amount
- remaining gap
- progress percentage
- months to goal at current top-up
- required monthly amount when a target date exists
- monthly shortfall if the goal date is tight
- on-track / needs-top-up status

The Savings overview now includes:

- goal progress stat
- next goal helper text
- “Savings pots and goals” cards
- progress bars on account cards

## Add/edit forms

Updated:

- `components/savings/SavingsAccountForm.tsx`
- `app/accounts/actions.ts`
- account edit modal inside `app/accounts/page.tsx`

Users can now add or edit:

- goal name
- target amount
- target date
- monthly goal top-up override

## Notes

This update is UI/data-model focused. It does not move money, create bank instructions, or assume savings advice. It gives users a clearer way to understand how far they are from a pot goal and what monthly pace is implied.

## Validation

A full Next build could not be completed in this sandbox because the supplied project bundle does not include `node_modules`. A TypeScript parse attempt reaches expected missing dependency / JSX type errors for Next, React and Node types.
