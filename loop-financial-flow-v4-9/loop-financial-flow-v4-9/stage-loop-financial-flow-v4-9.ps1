$ErrorActionPreference = "Stop"
if (-not (Test-Path ".\loop_work\package.json")) { throw "Run from the LOOP repository root." }

git add -- `
  loop_work/domains/wealth/financial-flow/FinancialFlowPage.tsx `
  loop_work/components/financial-flow/SavingsFlowDetail.tsx `
  loop_work/components/financial-flow/SavingsAllocationExplorer.tsx `
  loop_work/components/charts/StableSavingsCharts.tsx `
  loop_work/components/financial-flow/FinancialFlowWorkspaceNav.tsx `
  loop_work/app/spending/actions.ts `
  loop_work/components/spending/SpendingPlannerClient.tsx

git diff --cached --check
git status
