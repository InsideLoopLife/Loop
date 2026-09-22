# LOOP Financial Flow V4.4

Scope: retained workspace state + savings provenance + smarter Quick Add.

## Apply in Windows PowerShell

Put `loop-financial-flow-v4-4.zip` in `C:\Users\danie\Documents\Loop\loop_work\`.

```powershell
cd $HOME\Documents\Loop\loop_work

Expand-Archive `
  -Path .\loop-financial-flow-v4-4.zip `
  -DestinationPath ..\loop-financial-flow-v4-4 `
  -Force

cd $HOME\Documents\Loop

python .\loop-financial-flow-v4-4\apply-loop-financial-flow-v4-4.py

git diff --check

cd .\loop_work
npm run typecheck
```

If clean:

```powershell
cd $HOME\Documents\Loop

powershell -ExecutionPolicy Bypass `
  -File .\loop-financial-flow-v4-4\stage-loop-financial-flow-v4-4.ps1

git diff --cached --check
git status

git commit -m "Retain Financial Flow state and streamline data entry"
git push origin main
```

Do not stage `.pre-flow-v4-4.bak` files or extracted package folders.
