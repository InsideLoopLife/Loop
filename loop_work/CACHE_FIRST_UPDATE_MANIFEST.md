# LOOP cache-first update

Baseline: GitHub `main` commit `90de8b4cf9e838cb0a0655bd84da3b9a18284360`

Copy the enclosed `loop_work` folder over the repository root, preserving its folder structure.

## Changed files

- `loop_work/app/accounts/page.tsx`
- `loop_work/app/layout.tsx`
- `loop_work/app/spending/actions.ts`
- `loop_work/components/Nav.tsx`
- `loop_work/components/cache/RouteFreshnessManager.tsx`
- `loop_work/components/spending/CategoryGroupsBoard.tsx`
- `loop_work/lib/cache/client-route-cache.ts`
- `loop_work/lib/cache/invalidation.ts`
- `loop_work/lib/cache/route-policy.ts`
- `loop_work/lib/wealth/cached-savings-rate-deals.ts`
- `loop_work/test/cache-policy.test.ts`

## Behaviour

- Next's authenticated client router cache is reused during navigation.
- Routes are prefetched on hover, keyboard focus or touch intent.
- Cached/prefetched content paints first; potentially stale data reconciles in the background.
- Refresh intervals vary by data volatility (30 seconds to 5 minutes).
- Focus, tab visibility and reconnect events trigger a check only when due.
- Targeted stale events refresh affected routes without invalidating unrelated domains.
- Emergency `!` and category/group dragging update immediately, save in the background and roll back on failure.
- Savings-rate catalogue data is shared-cached for 15 minutes; personal Supabase data is not shared-cached.
- Emergency-fund calculation no longer queries the nonexistent `planned_items.monthly_cost` column and now includes selected child costs.
- Pension history is only loaded on the Projection tab.

## Validation

- `npm run typecheck` passed.
- Seven targeted cache and savings tests passed.
- Next.js production code and TypeScript compiled successfully.
- Local prerender then stopped at `/admin` because the clean checkout has no Supabase environment variables.

No SQL migration, dependency, worker or cron change is required.
