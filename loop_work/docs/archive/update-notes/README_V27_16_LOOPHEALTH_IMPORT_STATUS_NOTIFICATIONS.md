# V27.16 – LoopHealth import status, notifications and settings UI polish

This patch addresses the usability issues around menu URL imports and the LoopHealth daily UI.

## Changes

### Menu / URL import acknowledgement
- The Log food modal now shows an import status panel with clear steps:
  - Acknowledged
  - Reading page
  - Estimating nutrition
  - Ready
- Copy now explains that imports usually take around 10–40 seconds.
- The importer now returns whether clean page text was read directly, including the number of characters read, or whether web-search/AI extraction was used because the public page was sparse.
- Menu import notifications now use clearer states:
  - `Menu import acknowledged`
  - `Menu import ready`
  - `Menu import could not complete`

### Live notification behaviour
- The top navigation notification dot now polls every 15 seconds.
- The nav also listens for a `loop:notifications-updated` event, so import actions can nudge the unread badge without a full refresh.
- The Notifications page now includes a client auto-refresh helper so new import notifications appear while the user is waiting.

### Gauge layout
- Rebuilt the daily diet-balance gauge with an SVG semi-circle to stop the score/label text overlaying.
- Removed the duplicate score line under the gauge.

### Health settings
- Replaced native checkbox ticks with pill/toggle cards.
- Apple Health now shows as a future integration toggle instead of a visually noisy tick box.

## Files changed
- `components/nutrition/NutritionClient.tsx`
- `components/Nav.tsx`
- `components/notifications/NotificationAutoRefresh.tsx`
- `app/api/nutrition/menu-import/route.ts`
- `app/notifications/page.tsx`

## Migration
- No new database migration is required for V27.16.
- Continue to use `db/v27_15_loophealth_log_url_source_settings.sql` if it has not already been applied.

## Checks
- `npx tsc --noEmit` passed.
- `npm run build` compiled and completed TypeScript, then timed out during Next page-data collection in this sandbox.
