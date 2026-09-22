# LOOP Financial Flow V4

## Apply — Windows PowerShell

Put this ZIP into `C:\Users\danie\Documents\Loop\loop_work\`

```powershell
cd $HOME\Documents\Loop\loop_work

Expand-Archive `
  -Path .\loop-financial-flow-v4.zip `
  -DestinationPath ..\loop-financial-flow-v4 `
  -Force

cd $HOME\Documents\Loop

python .\loop-financial-flow-v4\apply-loop-financial-flow-v4.py

git diff --check

cd .\loop_work
npm run typecheck
```

If clean:

```powershell
cd $HOME\Documents\Loop

powershell -ExecutionPolicy Bypass `
  -File .\loop-financial-flow-v4\stage-loop-financial-flow-v4.ps1

git diff --cached --check
git status

git commit -m "Rebuild Financial Flow as a retained workspace"
git push origin main
```

Do not stage `.pre-flow-v4.bak` files.
