# Apply LOOP Instant Boot V3 locally (Windows PowerShell)

Put `loop-instant-boot-v3-full-platform.zip` in:

`C:\Users\<you>\Documents\Loop\loop_work\`

Then:

```powershell
cd $HOME\Documents\Loop\loop_work

Expand-Archive `
  -Path .\loop-instant-boot-v3-full-platform.zip `
  -DestinationPath ..\loop-instant-boot-v3 `
  -Force

cd $HOME\Documents\Loop

python .\loop-instant-boot-v3\apply-loop-instant-boot-v3.py

git diff --check

cd .\loop_work
npm install
npm run typecheck
```

If typecheck is clean, inspect:

```powershell
cd $HOME\Documents\Loop
git status
git --no-pager diff --stat
```

The installer creates `.pre-instant-boot-v3.bak` backups. Do not stage them.

Use targeted staging:

```powershell
git add `
  loop_work/lib/performance/route-boot.ts `
  loop_work/app/api/route-boot-snapshot/route.ts `
  loop_work/components/performance/RouteBootSnapshotPublisher.tsx `
  loop_work/components/performance/RouteBootAutoPublisher.tsx `
  loop_work/components/performance/InstantBootSnapshot.tsx `
  loop_work/components/loading/InstantRouteLoading.tsx `
  loop_work/components/financial-flow/FinancialFlowWorkspaceNav.tsx `
  loop_work/app/accounts/layout.tsx `
  loop_work/supabase/migrations/202608240001_route_boot_snapshots.sql `
  loop_work/app/layout.tsx `
  loop_work/lib/client/route-snapshot-cache.ts `
  loop_work/components/financial-flow/FinancialFlowHouseShell.tsx `
  loop_work/domains/wealth/financial-flow/FinancialFlowPage.tsx `
  loop_work/app/income/page.tsx `
  loop_work/app/spending/page.tsx `
  loop_work/app/accounts/page.tsx `
  loop_work/app/briefing/page.tsx `
  loop_work/domains/health/lifestyle/LifestylePage.tsx `
  loop_work/app/briefing/loading.tsx `
  loop_work/app/dashboard/loading.tsx `
  loop_work/app/financial-flow/loading.tsx `
  loop_work/app/income/loading.tsx `
  loop_work/app/spending/loading.tsx `
  loop_work/app/accounts/loading.tsx `
  loop_work/app/investments/loading.tsx `
  loop_work/app/mortgage/loading.tsx `
  loop_work/app/net-worth/loading.tsx `
  loop_work/app/retirement/loading.tsx `
  loop_work/app/nutrition/loading.tsx `
  loop_work/app/lifestyle/loading.tsx

git status
git commit -m "Add instant boot snapshots and unify Financial Flow"
git push origin main
```

Do not use `git add .`.
