$ErrorActionPreference = "Stop"
if (-not (Test-Path ".\loop_work\package.json")) { throw "Run from the LOOP repository root." }

git add -- `
  loop_work/components/financial-flow/FinancialFlowWorkspaceNav.tsx `
  loop_work/components/financial-flow/SavingsMarketHealthDeferred.tsx `
  loop_work/app/api/financial-flow/savings-market-health/route.ts `
  loop_work/components/spending/SpendingPlannerDeferredClient.tsx `
  loop_work/app/api/spending/deferred-context/route.ts `
  loop_work/components/financial-flow/SavingsFlowDetail.tsx `
  loop_work/domains/wealth/financial-flow/FinancialFlowPage.tsx `
  loop_work/app/spending/page.tsx `
  loop_work/components/spending/SpendingPlannerClient.tsx `
  loop_work/components/financial-flow/FinancialFlowHouseShell.tsx `
  loop_work/app/spending/loading.tsx

git status
