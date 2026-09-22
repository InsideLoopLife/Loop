# LOOP chart + snapshot V4.3

Apply after the V4.2 FinancialFlowPage hotfix.

```powershell
cd $HOME\Documents\Loop\loop_work

Expand-Archive `
  -Path .\loop-chart-snapshot-v4-3.zip `
  -DestinationPath ..\loop-chart-snapshot-v4-3 `
  -Force

cd $HOME\Documents\Loop

python .\loop-chart-snapshot-v4-3\apply-loop-chart-snapshot-v4-3.py

git diff --check

cd .\loop_work
npm run typecheck
```
