$ErrorActionPreference = "Stop"
if (-not (Test-Path ".\loop_work\package.json")) { throw "Run from the LOOP repository root." }

git add -- `
  loop_work/components/shell/PersistentNavContext.tsx `
  loop_work/components/shell/PersistentLoopShell.tsx `
  loop_work/lib/client/use-warm-route-snapshot.ts `
  loop_work/lib/client/route-snapshot-cache.ts `
  loop_work/components/loading/DashboardCachedRouteFallback.tsx `
  loop_work/components/loading/InvestmentsCachedRouteFallback.tsx `
  loop_work/components/loading/NetWorthCachedRouteFallback.tsx `
  loop_work/components/loading/RetirementCachedRouteFallback.tsx `
  loop_work/components/loading/IncomeCachedRouteFallback.tsx `
  loop_work/components/loading/NutritionCachedRouteFallback.tsx `
  loop_work/app/dashboard/loading.tsx `
  loop_work/app/investments/loading.tsx `
  loop_work/app/net-worth/loading.tsx `
  loop_work/app/retirement/loading.tsx `
  loop_work/app/income/loading.tsx `
  loop_work/app/nutrition/loading.tsx `
  loop_work/app/layout.tsx `
  loop_work/components/Nav.tsx `
  loop_work/components/financial-flow/FinancialFlowWorkspaceNav.tsx `
  loop_work/app/api/investments/history/route.ts `
  loop_work/components/investments/InvestmentHistoryChart.tsx

git status
