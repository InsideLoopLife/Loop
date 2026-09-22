$ErrorActionPreference = "Stop"
git add -- `
  loop_work/components/financial-flow/IncomeFlowScopeView.tsx `
  loop_work/components/financial-flow/FinancialFlowWorkspaceNav.tsx `
  loop_work/domains/wealth/financial-flow/FinancialFlowPage.tsx `
  loop_work/components/income/IncomeTrackerClient.tsx

git diff --cached --check
git status
