$ErrorActionPreference = "Stop"
if (-not (Test-Path ".\loop_work\package.json")) { throw "Run from C:\Users\danie\Documents\Loop." }

git add -- `
  loop_work/lib/investments/actions.ts `
  loop_work/components/investments/PensionsInvestmentsClient.tsx `
  loop_work/components/investments/AddPensionFundWizard.tsx

git diff --cached --check
git status
