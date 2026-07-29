# Modular tabs update — User Wealth, User Health and Admin

This update makes the main LOOP areas easier to maintain by moving the tab structure into one registry and giving the new Health/Admin tabs their own route files.

## What changed

### Shared section registry

New file:

- `lib/navigation/sections.ts`

This is now the source of truth for:

- User → Wealth tabs
- User → Health tabs
- Admin tabs
- hidden tabs such as Affordability, Can I afford and Lifestyle

To hide/show a tab, change the `hidden` flag here rather than editing the navigation component.

### Shared tab UI

New files:

- `components/navigation/SectionTabs.tsx`
- `components/admin/AdminTabs.tsx`

The main navigation and admin tabs use the same section data so tab changes are made once.

### User → Wealth

Existing Wealth routes remain separate, so each tab can still be updated independently:

- `/dashboard` — Overview
- `/accounts` — Accounts
- `/income` — Income
- `/spending` — Spending
- `/net-worth` — Net worth
- `/mortgage` — Mortgage
- `/investments` — Investments

Hidden but still available direct routes:

- `/affordability`
- `/affordability-lab`

### User → Health

New route wrappers were added so each Nutrition tab has a replaceable file:

- `app/nutrition/page.tsx` — Nutrition overview
- `app/nutrition/recipes/page.tsx` — Recipes
- `app/nutrition/food-log/page.tsx` — Food log
- `app/nutrition/meal-cards/page.tsx` — Meal cards
- `app/nutrition/NutritionPageShell.tsx` — shared data-loading shell

The Lifestyle section remains available at `/lifestyle`, but is hidden from the Health navigation until it is rebuilt.

### Admin

The Admin area now has a fixed top-level tab structure:

- `/admin` — Overview
- `/admin/users` — Users
- `/admin/databases-infrastructure` — Databases / Infrastructure
- `/admin/notifications` — Notifications
- `/admin/security` — Security
- `/admin/runtime-issues` — Runtime issues
- `/admin/email-formats` — Email formats

New runtime issue helper:

- `lib/admin/runtime-suggestions.ts`

This keeps deterministic issue suggestions and model lane settings separate from the UI. The runtime issue tab now reads `LOOP_RUNTIME_ISSUE_AI_MODEL` first, then falls back to existing OpenAI model env vars.

## Notes

- Profile and household logic has not been moved into Wealth/Health tabs. It remains separate through account/household routes.
- Old detailed routes such as `/nutrition/cards/[id]` and `/admin/uptime` are preserved for backwards compatibility.
- I ran a syntactic TSX transpile check on the changed files. A full `tsc --noEmit` cannot complete in this sandbox because dependencies like `next`, `react`, `@types/node`, `@supabase/*` and `lucide-react` are not installed in `node_modules`.
