# Financial Flow V4.5 — navigation cleanup

Apply after V4.4.

```powershell
cd $HOME\Documents\Loop\loop_work
Expand-Archive -Path .\loop-financial-flow-v4-5.zip -DestinationPath ..\loop-financial-flow-v4-5 -Force

cd $HOME\Documents\Loop
python .\loop-financial-flow-v4-5\apply-loop-financial-flow-v4-5.py

git diff --check
cd .\loop_work
npm run typecheck
```
