# LOOP v29.02 performance merge

This package is based on GitHub `main` commit `4cf1a85fa0e381e8458d11ce74f065df16806088` (3 August 2026, 15:22 UK time).

## Application changes

- `loop_work/lib/wealth/monthly-performance.ts` uses the compact `loop_monthly_portfolio_performance` RPC instead of downloading raw investment and pension snapshot histories.
- `loop_work/lib/supabase/middleware.ts` uses `getClaims()` for request token verification.
- `loop_work/app/dashboard/page.tsx` no longer blocks the dashboard response on invite and assumption housekeeping already handled by the relevant auth/assumption flows.
- `loop_work/app/api/user/navigation-bootstrap/route.ts` provides navigation preferences, feature access, admin access and unread count through one browser request.
- `loop_work/components/Nav.tsx` uses the consolidated navigation bootstrap endpoint.
- `loop_work/app/api/notifications/unread-count/route.ts` no longer runs invite cleanup every 15 seconds.
- `loop_work/app/dashboard/loading.tsx` gives immediate visual feedback while dashboard data loads.
- `loop_work/lib/nutrition/product-data.ts` includes the existing `ai_photo` source in its TypeScript union, fixing a build error already present in the GitHub head.

## Database status

The compact RPC and supporting snapshot index are already live in Supabase. Do not rerun the earlier performance SQL solely for this package.

## Validation

- `npm run typecheck`: passed.
- `next build`: application compilation and TypeScript passed; clean-checkout prerender then stopped because local Supabase environment variables were intentionally unavailable.
- `npm run lint`: currently blocked by the repository's pre-existing ESLint 9 configuration issue (`eslint.config.js`, `.mjs` or `.cjs` is absent).

## Render settings

- Root Directory: `loop_work`
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Health Check Path: `/access`
