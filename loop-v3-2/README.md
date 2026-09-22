# LOOP V3.2 — Windows PowerShell

Put `loop-v3-2-shell-charts-integrity.zip` in `C:\Users\danie\Documents\Loop\loop_work\`.

```powershell
cd $HOME\Documents\Loop\loop_work

Expand-Archive `
  -Path .\loop-v3-2-shell-charts-integrity.zip `
  -DestinationPath ..\loop-v3-2 `
  -Force

cd $HOME\Documents\Loop
python .\loop-v3-2\apply-loop-v3-2.py

git diff --check

cd .\loop_work
npm run typecheck
```

If clean:

```powershell
cd $HOME\Documents\Loop
powershell -ExecutionPolicy Bypass -File .\loop-v3-2\stage-loop-v3-2.ps1

git diff --cached --check
git status

git commit -m "Persist app shell and restore chart integrity"
git push origin main
```

Do not stage `.pre-v3-2.bak` files.
