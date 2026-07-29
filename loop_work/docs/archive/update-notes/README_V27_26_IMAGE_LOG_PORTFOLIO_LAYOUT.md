# V27.26 – Image proxy, food-log persistence and investment layout

## Fixes included

### LoopHealth images
- Added `/api/image-proxy` so remote product/recipe images are fetched server-side and served from the app domain.
- Added `/api/food-image-placeholder` so food/product cards never collapse to a broken blank frame when a real image is missing.
- Updated recipe cards, saved-card pages, food-log rows and modal previews to use the proxy/placeholder path.

### Food log completeness
- Fixed the daily food log grouping so unknown/legacy meal slots are shown under **Other** instead of being hidden.
- Direct product logging now attempts to save a reusable meal/product card every time, not only when nutrition values are above zero.
- Auto-save has a legacy-schema fallback, so the food log can still save the reusable card when newer product columns are missing.

### Investments layout
- The investments page now uses more width and adds a household/person portfolio split at the top.
- Tabs now focus on the data available for the selected person/household.
- Added portfolio and pot-level mini line charts driven by `investment_price_snapshots` from the 15-minute price logging cron.

## New API routes
- `app/api/image-proxy/route.ts`
- `app/api/food-image-placeholder/route.ts`

## Migration
No new migration is required beyond v27.25. The investment line charts use the existing `investment_price_snapshots` table from the earlier price-history migration.

## Verification
- `npx tsc --noEmit` passed.
- `npm run build` began successfully but timed out during the optimised production build in the sandbox.
