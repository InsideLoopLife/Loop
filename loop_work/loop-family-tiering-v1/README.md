# LOOP Family Tiering v1

Production Supabase is already updated.

- Free: 25 searches/month, 10 holdings/account
- Extra: 100 searches/month, 30 holdings/account
- Plus: 250 searches/month, 75 holdings/account
- Pro: 1,000 searches/month shared across the household, 250 holdings/account

Pro now resolves as a household/family licence for linked active household members. AI and investment lookup allowances on Pro use household scope. Existing holdings are never deleted on downgrade; only new additions are blocked when over capacity.

The database includes a final-write trigger on `investment_holdings`, so the cap cannot be bypassed by another app route.

The installer:
- adds the new feature key/helper;
- makes stock searches consume `investment_lookup`;
- removes debounced auto-search so typing does not burn allowance;
- adds a friendly server-side holding-cap check before the DB trigger.

Run:
```powershell
cd C:\Users\danie\Documents\Loop\loop_work
& "PATH_TO_EXTRACTED\install-family-tiering.ps1" -RepoRoot "C:\Users\danie\Documents\Loop\loop_work"
git diff --check
git status
```
