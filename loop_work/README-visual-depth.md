# Visual depth pass — matching the HTML mockup's look more closely

Same file, `components/mortgage/MortgagePlannerClient.tsx`, whole-file replacement. Two more changes on top of the last delivery:

1. **Background gradient wash** on the House page's `<main>` — two soft radial gradients (violet top-left, blue top-right), same positioning/colours as the HTML mockup, added via inline `style` since it's a one-off page background rather than a reusable utility.
2. **Richer follow-on card gradient** — was a flat two-stop `from-orange-50 to-amber-50`, now a three-stop `from-amber-100 via-orange-50 to-amber-50` with a tinted shadow (`shadow-orange-200/60`), closer to the mockup's depth.

## On "why it won't appear"
Traced it as far as I can from the code alone:
- Confirmed the code from last message is genuinely in commit `9276962`, pushed today at 14:52
- The 5-minute route cache I found (`route-policy.ts` / `RouteFreshnessManager.tsx`) only governs when the client re-fetches *data* — it doesn't cache the compiled JS/CSS, so it shouldn't be why new styling fails to appear
- No service worker in the app that could be caching an old bundle

The one thing I can't check myself is whether Render's deploy for `9276962` actually went green and is the live one — that's the log/URL I asked you to confirm. Once this new commit is in, worth checking the deploy log for it specifically too, in case there's a pattern.

## Verified
```
npx tsc --noEmit -> exit 0
npm run build      -> compiles + typechecks clean, same one unrelated
                       /account/money-strategy env-var failure
```
