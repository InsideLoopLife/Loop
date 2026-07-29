# v27.46 Hotfix — nutrition logging + SnapTrade sandbox wiring

## Fixes included

- Fixes the runtime crash: `cardSearch is not defined`.
- Restores saved-card logging search in the food log modal.
- Shows more imported menu items instead of only the first handful.
- Makes the menu importer run extra exhaustive passes when a takeaway/menu page comes back suspiciously small.
- Adds a product-label scanner component for Nutrition/Supplement Facts images.
- Adds an apply-corrected-label action so bad product nutrition can be replaced after review.
- Adds SnapTrade server-side client helpers and API routes for status, register user and connection portal.

## Run this migration

```sql
-- db/v27_46_hotfix_snaptrade_and_nutrition.sql
```

## SnapTrade environment variables

Do not put these in any `NEXT_PUBLIC_` variable.

```bash
SNAPTRADE_CLIENT_ID=your-client-id
SNAPTRADE_CONSUMER_KEY=your-consumer-key
SNAPTRADE_BASE_URL=https://api.snaptrade.com/api/v1
SNAPTRADE_CONNECTION_REDIRECT_URL=http://localhost:3000/integrations/snaptrade/callback
```

For production, rotate the consumer key again because it has been pasted into chat/dev context and should be treated as exposed.

## Test order

1. Restart Next dev server.
2. Open `/nutrition` and confirm food log modal no longer crashes.
3. Search saved cards and log one card.
4. Import `https://topgrill.co.uk/our-menu/` and confirm extra passes run if fewer than 30 items are found.
5. Open a product card, upload the GFuel Supplement Facts image, click **Read label**, then **Apply corrected label data**.
6. Add SnapTrade env vars, then call `/api/snaptrade/status`.
7. Call `/api/snaptrade/register`, then `/api/snaptrade/portal` to generate the connection portal link.
