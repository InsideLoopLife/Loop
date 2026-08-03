# Full status vs github.com/InsideLoopLife/Loop — checked directly, not from memory

## ✅ Already live on GitHub (verified just now, not assumed)

- Tiering/entitlements consolidation (plan assignment fan-out, upgrade-only
  protection, realtime feature toggle)
- AI budget enforcement across all 12 AI routes + the stock-refresh rate
  limit
- Trading 212 transaction-history import + the multi-import accumulation
  fix
- Moneybox fund catalogue accuracy update
- SnapTrade fixes: the price-polling reset bug, cost-basis wipe
  protection, and the "Remove access" stuck-connection bug
- The full 18-file/1-tsconfig TypeScript production-build fix set (this
  is why the Render build got past every error)
- Navigation fixes (Integrations link, account tabs)

**None of this needs re-pushing.** If you've already deployed since
around 22:00 on 31 July, all of the above is genuinely live.

---

## ⏳ NOT on GitHub yet — everything in this package

Checked every single one directly against the actual repo just now —
these are the real gaps, not a guess:

| Feature | What it does |
|---|---|
| **Privacy mode** | Blur amounts / made-up currency, account settings toggle (`components/privacy/*`, `AccountPage.tsx`, `app/account/actions.ts`) |
| **Delete-button audit fixes** | 7 previously-unchecked deletes now properly error-checked (`app/loopwatch/actions.ts`, `app/admin/product-imports/actions.ts`, `lib/investments/actions.ts`, `app/account/actions.ts`) |
| **Login page redesign** | The convergence-visual split-screen (`app/login/page.tsx`) |
| **Introduction page** | The new marketing/info page at the site root, replacing the old unconditional redirect (`components/marketing/IntroductionPage.tsx`, `app/page.tsx`) |
| **Mobile camera fix** | Direct camera access on the two nutrition photo-upload points (`components/nutrition/ProductLabelScanner.tsx`, part of `NutritionClient.tsx`) |
| **Food photo logging** | New: photograph food/drink directly (no label needed), AI identifies it and estimates fluid ml + full macros/micros (`app/api/nutrition/food-photo-estimate/route.ts`, part of `NutritionClient.tsx`) |
| **Shared animation classes** | `app/globals.css` — used by both the login page and introduction page |

**16 files total, all fresh-checked clean** (fresh esbuild syntax check
run just now, not carried over from when each was originally built).

## Database side — already live regardless of code push

The privacy_mode column, seed, and fake-currency-name fields are already
applied directly to your Supabase database. Only the *code* that reads
and displays them is outstanding — the data layer doesn't need anything
further from you.

## What "security and platform changes" specifically refers to

Since you mentioned this directly — the security-relevant work already
live includes: the login page's credential-in-URL hardening (from
earlier), every RLS/admin-gating check done during the tiering
consolidation, and the delete-audit fixes in this package (silent-failure
protection on 7 actions). Nothing in this specific package is a security
fix beyond the delete-audit item — the rest here is genuinely new
feature work (privacy mode, food photo logging) and the two new pages.

## To deploy this package

Copy all 16 files into matching paths in `loop_work/`, overwrite where
they exist, push, then trigger a Render deploy.
