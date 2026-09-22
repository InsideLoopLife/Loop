# LOOP Financial Flow Income V4.7.1

Corrected replacement for V4.7. The duplicate raw month-label removal is now optional because V4.5 may already have removed it, and the missing IncomeFlowScopeView payload is included.

```powershell
cd $HOME\Documents\Loop\loop_work
Expand-Archive -Path .\loop-financial-flow-income-v4-7-1.zip -DestinationPath ..\loop-financial-flow-income-v4-7-1 -Force
cd $HOME\Documents\Loop
python .\loop-financial-flow-income-v4-7-1\apply-loop-financial-flow-income-v4-7-1.py
git diff --check
cd .\loop_work
npm run typecheck
```
