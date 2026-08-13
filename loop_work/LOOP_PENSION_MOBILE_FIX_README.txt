LOOP pension and mobile investments fix
=======================================

Copy the included loop_work folder over the loop_work folder in the Loop repository.
Only six code/test files are included; unrelated files will not be replaced.

Changes included
----------------
- Stops pension parent pots and child funds being counted twice.
- Fixes the saved-NI 100% pass-back being treated as 100% of salary.
- Groups pension contribution threads into readable monthly entries on mobile.
- Shows provider-confirmed status without displaying invented 0.0000 purchase units.
- Replaces cramped mobile diversification bars with allocation/movement tiles.
- Makes the management-charge worker observational: it estimates costs but never
  reconstructs or cancels provider-confirmed units.
- Loads all required pension timing and NI configuration fields from Supabase.

Validation
----------
- Six targeted regression tests passed.
- TypeScript typecheck passed.
- Next.js production compilation and TypeScript passed.
- Static prerender stopped only because Supabase environment variables were not
  available in the temporary validation workspace.

After copying, run from loop_work:

  npm ci
  npm run typecheck
  node --import tsx --test test/pension-valuation.test.ts test/pension-contribution-integrity.test.ts
  npm run build

Keep the pension/fees cron paused until this code has deployed successfully.
