LOOP pension, contribution integrity and compact-view fix
=========================================================

Copy the included loop_work folder over the loop_work folder in the Loop
repository. Only the changed code, migration and test files are included;
unrelated files will not be replaced.

Important deployment order
--------------------------
1. Keep the included Supabase migration in the repository:
   supabase/migrations/20260813220109_pension_view_mode_preference.sql
   It has already been applied to the connected live Supabase project.
2. Copy/deploy the application files.
3. Run the validation commands below.
4. Keep the pension/fees cron paused until the deployment is confirmed healthy.

Changes included
----------------
- Adds a compact pension-card layout with the real pot value and history chart
  always visible.
- Places Expand, Threads, Settings and Delete together at the top right of a
  compact card; Collapse remains in the same position when expanded.
- Shows the segmented fund-allocation bar in compact mode instead of long fund
  name and percentage chips.
- Adds a three-dot thread shortcut that expands the pot, opens the combined
  contribution history and scrolls directly to it.
- Lets a user expand an individual pot to see contribution logic, fund purchases
  and full history threads.
- Adds a persistent Cards / Full width preference to app_user_profiles.
- Keeps the Lines / Squares preference scoped to investments only.
- Stops pension parent pots and child funds being counted twice.
- Fixes saved-NI 100% pass-back being treated as 100% of salary.
- Groups pension contribution threads into readable monthly entries on mobile.
- Shows provider-confirmed status without invented 0.0000 purchase units.
- Replaces cramped mobile diversification bars with allocation/movement tiles.
- Makes the management-charge worker observational: it estimates costs but never
  reconstructs or cancels provider-confirmed units.
- Loads all required pension timing and NI configuration fields from Supabase.

Validation completed
--------------------
- TypeScript typecheck passed.
- Pension contribution integrity tests passed (3/3).
- The earlier production compile completed through compilation and TypeScript;
  static prerender requires the deployment Supabase environment variables.

After copying, run from loop_work:

  npm ci
  npm run typecheck
  node --import tsx --test test/pension-contribution-integrity.test.ts
  npm run build

The Supabase CLI was not installed in the temporary workspace, so the migration
file follows this repository's existing timestamped migration convention and is
included for you to apply through your normal Supabase deployment process.
