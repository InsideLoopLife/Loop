$ErrorActionPreference = "Stop"

$repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $repo "loop_work\package.json"))) {
  throw "Run this script from the LOOP repository root."
}

git add -- `
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
