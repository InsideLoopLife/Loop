$ErrorActionPreference = "Stop"
if (-not (Test-Path ".\loop_work\package.json")) { throw "Run from the LOOP repository root." }

git add -- `
  loop_work/components/financial-flow/FinancialFlowRetainedStore.tsx `
  loop_work/components/financial-flow/FinancialFlowRetainedOverviewBridge.tsx `
  loop_work/components/financial-flow/FinancialFlowRetainedLoading.tsx `
  loop_work/components/financial-flow/SmartFinancialFlowAdd.tsx `
  loop_work/components/charts/StableSavingsCharts.tsx `
  loop_work/app/financial-flow/loading.tsx `
  loop_work/app/spending/loading.tsx `
  loop_work/components/shell/PersistentLoopShell.tsx `
  loop_work/components/financial-flow/FinancialFlowWorkspaceNav.tsx `
  loop_work/components/financial-flow/SavingsFlowDetail.tsx `
  loop_work/components/spending/SpendingPlannerDeferredClient.tsx `
  loop_work/domains/wealth/financial-flow/FinancialFlowPage.tsx `
  loop_work/app/spending/page.tsx `
  loop_work/components/spending/SpendingPlannerClient.tsx

git status
