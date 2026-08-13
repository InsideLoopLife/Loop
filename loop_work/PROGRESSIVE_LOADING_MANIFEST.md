# Loop progressive loading update

Baseline: GitHub `main` commit `2e329d09b3b40e120880b94ec0904cd996b918ea`.

This package is independent of `LOOP_FRESH_DATA_MOTION_REBUILT_aa14802.zip`; the two packages do not overwrite the same files.

## Behaviour

- Wealth destinations are prefetched during browser idle time as well as on hover, focus and touch.
- Navigation links use Next.js route prefetching in production.
- Overview, Financial Flow, Investments and House stream page-shaped loading states before their authenticated data queries finish.
- The global route loading state keeps navigation visible and clearly says which area is opening.
- Navigation preferences/features bootstrap once instead of being refetched after every pathname change.
- A newly rendered page is accepted as current rather than triggering a second full `router.refresh()` request.
- Previously visited routes reconcile after paint only when their route-specific freshness window has expired.
- Existing authenticated Supabase reads remain request-scoped and RLS-protected; no authenticated HTML or session token is placed in a shared cache.

## Files

- `loop_work/app/dashboard/page.tsx`
- `loop_work/app/investments/page.tsx`
- `loop_work/app/loading.tsx`
- `loop_work/components/Nav.tsx`
- `loop_work/components/cache/RouteFreshnessManager.tsx`
- `loop_work/components/loading/WealthRouteSkeleton.tsx`
- `loop_work/domains/wealth/financial-flow/FinancialFlowPage.tsx`
- `loop_work/domains/wealth/house/HousePage.tsx`
- `loop_work/lib/cache/client-route-cache.ts`
- `loop_work/test/cache-policy.test.ts`

## Validation

- TypeScript passed.
- Eight targeted cache/savings tests passed.
- New loading/cache files passed focused ESLint.
- Next.js production code and TypeScript compilation passed. Static page generation then reached the expected clean-checkout boundary because Supabase environment variables are available on Render but not locally.

No migration, dependency, worker or cron change is required.
