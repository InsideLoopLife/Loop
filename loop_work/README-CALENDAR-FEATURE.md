# Calendar feature — v2, verified against the real repo

The first draft was built blind (guessed table/column names). This version
was built after cloning `github.com/InsideLoopLife/Loop` directly and
checking every table, column, and client-helper name against real usage.
Still not a drop-in — see "Still needs your input" below.

## Confirmed correct against the real repo

- Client helpers: `createServerDatabaseClient()` (`@/platform/database/server-client`,
  async), `createBrowserDatabaseClient()` (`@/platform/database/browser-client`),
  `createAdminClient()` (`@/platform/database/admin-client`),
  `createWorkerDatabaseClient(domain)` (`@/platform/database/worker-client`,
  domain is one of `market|rates|wealth|health|notifications|platform`).
- Household scoping: `getActiveHouseholdContext()`, `householdWriteFields()`,
  `householdMemberDataOrFilter()` — all from `@/domains/identity/household`
  (the canonical path; `@/lib/auth/household-context` is a deprecated
  re-export of the same module).
- `planned_items`: `id, user_id, household_id, visibility_scope, person_id,
  category_id, direction ('incoming'|'outgoing'), item_type, label, amount,
  recurrence, recurrence_interval_days, start_date, end_date, day_of_month,
  payment_timing, payment_adjustment`. This is the real source for
  payment/income markers — there's no `recurring_payment_schedules` table
  (that was a first-draft guess).
- `food_logs`: `id, user_id, person_id, meal_id, eaten_on, eaten_at,
  calories, ...`.
- `people`: household members, `id, user_id, household_id, name,
  relationship, ...` — the migration adds `daily_calorie_target` here.
- `app_user_profiles.user_id` and `app_households.id` are genuinely the
  primary keys (checked the DDL in `supabase/migrations/`).
- `GET /api/household/members` already exists and returns
  `{ householdId, members: [{ id, displayName, relationship }] }` — the UI
  calls this directly rather than duplicating the query.
- **Calorie targets are not personalized today.** `NutritionClient.tsx` uses
  a hardcoded `DAILY_TARGETS.calories = 2200` constant, with a comment
  saying personalization is future work. Per your answer, the migration
  adds real per-person storage (`people.daily_calorie_target`, nullable —
  falls back to 2200 when unset).

## Not verified / still needs your input

1. **`people`'s primary key** — I couldn't find its `CREATE TABLE` in
   `supabase/migrations/`, so `id uuid primary key` in the FK is inferred
   from the consistent pattern everywhere else in the schema, not confirmed
   from DDL directly. Check before applying the migration.
2. **`payment_adjustment`** (`'fixed_day' | 'previous_workday'`, seen being
   *set* in `app/spending/actions.ts`) implies some planned items shift off
   weekends/bank holidays. I never found where it's actually *read*/applied
   — `materialize.ts` uses the raw `day_of_month` and does not apply this
   adjustment. If your "noticeable payment point" markers need to land on
   the actual adjusted date, that logic needs porting in from wherever it's
   really consumed (I'd guess `lib/affordability` or `lib/planning`, but
   didn't find it in the time I spent).
3. **Architecture mismatch on the lifestyle page.** `LifestylePage.tsx` does
   its data fetch server-side (behind `requireHealthPageAccess`) and passes
   props into `LifestyleClient.tsx`, a plain client component. My
   `CalendarPage.tsx` instead fetches with its own browser Supabase client.
   It'll work, but it doesn't match the pattern the rest of this page uses.
   Worth deciding whether to refactor CalendarPage into a
   props-in/no-own-fetch component to match, or leave it as the one
   self-fetching piece on that page.
4. **Calorie target edit permissions** — `app/api/calendar/people/target/route.ts`
   only checks "same household or self," not the `canManagePeople`/permission-tier
   gating `app/household/actions.ts` uses for other edits to `people`. Decide
   if that's the right bar for this field specifically.
5. **Google OAuth verification** — any Google Cloud OAuth app requesting
   Calendar scopes is restricted to test users only until Google reviews the
   app (can take days–weeks). Separate from this code; start it early if you
   want this live for real users.
6. Redirects in the OAuth connect/callback routes now point at the real
   `/lifestyle` page (confirmed it exists) with `?calendar_connected=1` /
   `?calendar_error=...` query params — you'll need to actually read and
   surface those in `LifestyleClient.tsx`, they're not handled there yet.

## Files, in build order

1. `migrations/20260921_calendar_feature_v2.sql`
2. `lib/calendar/types.ts`
3. `lib/calendar/materialize.ts` — recurrence-to-occurrence calculator
   supports weekly/fortnightly/four_weekly/monthly/quarterly/annual(ly)/yearly/
   custom_interval/one_off, matching the recurrence vocabulary found in the repo.
4. `lib/calendar/ics.ts`
5. `app/calendar/feed/[token]/route.ts`
6. `app/api/calendar/feed-url/route.ts`
7. `app/api/calendar/people/target/route.ts` — new, sets per-person calorie target
8. `lib/google/oauth.ts` + `app/api/calendar/google/{connect,callback}/route.ts`
9. `lib/google/sync.ts`
10. `worker/calendarSyncCron.ts` — now iterates households (deduped by
    `householdId`, or `solo:<userId>` for accounts with no household), not
    raw user rows, since materialization needs the whole member list at once.
11. `components/calendar/{FilterBar,DayCell,CalendarPage}.tsx` — FilterBar
    now includes a person filter (whole household / per person), per your
    answer. Tailwind classes not checked against your actual design tokens.

## Env vars

```
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://<your-domain>/api/calendar/google/callback
NEXT_PUBLIC_APP_URL=https://<your-domain>
```

## Suggested verification pass before merging

```
cd Loop/loop_work
grep -n "create table if not exists people" -A5 supabase/migrations/*.sql   # confirm PK
grep -rn "payment_adjustment" lib app --include="*.ts"                       # find where it's actually applied
tsc --noEmit
```

## v3 addition — nav-banner quick access icon

Built by patching the real `components/Nav.tsx` directly (copied from your
repo, then edited with precise find/replace — not rewritten from scratch),
so it should merge cleanly. New files:

- `app/api/calendar/quick-summary/route.ts` — small payload: next 5
  upcoming payments/income in the next 14 days, plus today's calorie
  progress. Goes through `createServerDatabaseClient`, so RLS does the
  household-visibility filtering — no manual household lookup needed.
- `lib/calendar/useQuickCalendarSummary.ts` — the cache-first hook.
- `components/calendar/CalendarQuickAccessButton.tsx` — the icon + popover.

**Speed approach — matches your existing convention, doesn't invent a new one:**
Found `CACHE_FIRST_UPDATE_MANIFEST.md`, `lib/cache/route-policy.ts`, and the
`requestIdleCallback` warm-up already in `Nav.tsx` (`warmRoutes`/
`eagerWealthRoutes`) — that's the exact "cached content paints first, stale
data reconciles in the background" pattern you described, so I hooked into
it rather than building something parallel:

- The popover reads from `sessionStorage` synchronously on mount — if it
  was warmed during idle time, opening it shows real content with zero
  network wait, same as your route-cache model.
- `warmQuickCalendarSummary()` is called from the *same* `requestIdleCallback`
  block that already warms `eagerWealthRoutes`, not a separate one.
- Cache max-age is 2 minutes, matching the existing `/lifestyle` entry in
  `route-policy.ts` (`ROUTE_POLICIES`) — same volatility class reasoning:
  calendar markers materialize once daily and rarely change mid-session.
- On open, it always kicks a background refresh, but never blanks existing
  content to show a spinner — the skeleton only ever appears on a truly
  cold load with no cache at all (mirrors `WealthRouteSkeleton.tsx`'s
  page-shaped-loading-state approach rather than a bare spinner).
- Refreshed data is only swapped in if it actually differs from what's
  shown (content comparison, not timestamp comparison) — avoids a pointless
  re-render when nothing changed.

**Placement:** added in all three nav layouts (mobile top header, side nav
top area next to Brand, desktop top header next to the Account button) so
it's available regardless of which layout the user has chosen — "always
pressed in the nav banner" only fully holds if it's in all three, since
Loop lets people switch between them.

**Not verified:**
- Icon names (`CalendarClock`, `PoundSterling`, `Flame`) checked against
  `lucide-react@0.383.0` in a throwaway sandbox install — your `package.json`
  actually pins `1.17.0`. These are long-stable icon names, very unlikely
  to have moved, but not checked against your exact pinned version.
- `/lifestyle?tab=calendar` link in the popover's "Open full calendar"
  assumes that's where you'll mount `CalendarPage` — adjust if you mount
  it elsewhere.
- Didn't add a badge/dot indicator (like the existing `unreadCount` dot on
  the account button) for "something's due today" — straightforward to
  add on the same data if you want it, left out since it wasn't asked for
  and seemed worth confirming rather than assuming.
