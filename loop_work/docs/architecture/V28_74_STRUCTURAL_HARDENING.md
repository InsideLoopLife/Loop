# v28.74 Structural hardening

This pass is deliberately light on new product features and heavier on the way Loop is organised.

## Core pattern

Pages should be thin:

```txt
page.tsx -> load data -> build model -> render shell/component
```

Logic should live in `lib/*` as pure functions where possible. UI components should render a model, not query Supabase directly.

## Financial Flow structure

New shared files:

- `lib/financial-flow/types.ts`
- `lib/financial-flow/date-window.ts`
- `lib/financial-flow/categories.ts`
- `lib/financial-flow/build-financial-flow-model.ts`

The next UI iteration should progressively move remaining inline Financial Flow helpers out of `app/financial-flow/page.tsx` and into these modules.

## Account structure

Account is now treated as three understandable areas:

- Personal
- Health
- Wealth

Specialist wealth modules are toggled from Account → Wealth so users do not see student-loan, car-finance, childcare or debt trackers unless they apply.

## Household privacy model

Admins can manage access and permissions. They cannot force another adult to share their private records.

New member-level preferences:

- `share_income`
- `share_spending`
- `share_savings`
- `share_investments`
- `share_health_summary`

New record-level hide table:

- `app_household_hidden_records`

Use this when a record is otherwise household-visible but the owner chooses to hide that specific item.

## Worker / job model

New helper:

- `lib/platform/worker-health.ts`

The app should use background workers or cron endpoints for recurring work. The web app should not be the long-running loop for pricing, savings, mortgage or LoopWatch jobs.

## Verification scripts

Added package scripts:

- `typecheck`: `tsc --noEmit`
- `verify`: `npm run typecheck && npm run lint && npm run build`

Run `npm install` then `npm run verify` before deploying the full package.
