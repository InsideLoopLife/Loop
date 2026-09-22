# LOOP Financial Flow Income V4.7

```powershell
cd $HOME\Documents\Loop\loop_work
Expand-Archive -Path .\loop-financial-flow-income-v4-7.zip -DestinationPath ..\loop-financial-flow-income-v4-7 -Force
cd $HOME\Documents\Loop
python .\loop-financial-flow-income-v4-7\apply-loop-financial-flow-income-v4-7.py
git diff --check
cd .\loop_work
npm run typecheck
```
