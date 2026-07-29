# V27.19 – Dynamic menu / SPA import handling

This patch handles the exact problem seen with `viewthe.menu` / TenKites-style pages: the visible menu is often rendered client-side by JavaScript, so the raw HTML can look empty to a simple scraper.

## What changed

### Shared evidence collector
Added:

- `lib/imports/public-page-evidence.ts`

It now attempts to collect page evidence in layers:

1. Static HTTPS fetch.
2. Visible server-rendered text extraction.
3. JSON-LD extraction.
4. Image candidates from OG/meta/img tags.
5. Dynamic-page detection for SPA-style sites such as TenKites / `viewthe.menu`.
6. Optional headless browser rendering when enabled.
7. AI/web extraction fallback using the saved OpenAI token.

### Menu imports
Updated:

- `app/api/nutrition/menu-import/route.ts`

Menu import now sends AI the evidence mode, dynamic app status, JSON-LD, API/network hints where captured, and visible page text.

It also returns these fields to the UI:

- `sourceMode`
- `dynamicAppDetected`
- `headlessAttempted`
- `headlessSucceeded`
- `evidenceNote`
- `apiHintCount`
- `imageCount`

Notifications are also clearer when a dynamic menu is detected.

### Recipe imports
Updated:

- `app/api/nutrition/recipe-import/route.ts`

Recipe import now uses the shared evidence collector too, so dynamic recipe sites can use the same static/structured/headless/fallback pathway.

## Headless browser note

Headless rendering is optional and off by default.

To enable it in production, deploy with:

```bash
LOOP_ENABLE_HEADLESS_IMPORTS=true
```

The runtime must also have Playwright/Chromium available. This patch uses an optional runtime import, so the app still builds without Playwright installed. For Render, the practical next deployment step is to add a Playwright-capable image/build step or install Chromium and set the required browser path.

Without headless enabled, dynamic menus still continue through AI/web extraction, but the UI now explains that the menu is JavaScript-rendered rather than looking like nothing happened.

## Checks

- `npx tsc --noEmit` passed.
- `npm run build` compiled and completed TypeScript, then timed out during Next page-data collection in the sandbox.
