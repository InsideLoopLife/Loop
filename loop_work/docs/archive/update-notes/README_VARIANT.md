# Life Tracker V23.1 Loop Navigation Patch

This patch keeps the V23 LoopWealth/LoopHealth structure and updates the header navigation:

- LoopWealth and LoopHealth are now mode toggles rather than simultaneous nav groups.
- The right-side toggle switches between the Wealth nav and Health nav.
- Account, Notifications and Sign out remain inside a fixed account dropdown.
- The desktop header uses 95vw width for more usable navigation space.

# Life Tracker V20 — Responsive Web Baseline

This zip is the standard desktop/mobile responsive web app. Use this version when you want to keep testing the current web dashboard format without the iPhone/PWA-specific shell.

## Use this when

- You want normal browser-based testing on desktop and mobile.
- You want the existing navigation and layouts.
- You are deploying to a private web URL first.
- You do not yet want the PWA home-screen/mobile shell behaviour.

## Run locally

```bash
npm install
npm run dev
```

## Database

Use the latest migration you have already run. This package is based on the current V19 codebase and does not require a new migration by itself.
