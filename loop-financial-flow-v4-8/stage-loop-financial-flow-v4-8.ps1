$ErrorActionPreference = "Stop"
if (-not (Test-Path ".\loop_work\package.json")) { throw "Run from the LOOP repository root." }

git add -- `
  loop_work/components/financial-flow/FinancialFlowReasonCard.tsx `
  loop_work/components/spending/SpendingPlannerClient.tsx `
  loop_work/components/financial-flow/SavingsFlowDetail.tsx

git diff --cached --check
git status
