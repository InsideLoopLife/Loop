# LOOP Financial Flow V4.8

Scope:
- minimise Spending add clicks
- make groups/categories easier to reach
- make Savings reasoning understandable

This package is compatible with the V4.7 Income tranche because it does not patch the V4.7-specific Income files.

## Apply

Put the ZIP in `C:\Users\danie\Documents\Loop\loop_work\`.

```powershell
cd $HOME\Documents\Loop\loop_work

Expand-Archive `
  -Path .\loop-financial-flow-v4-8.zip `
  -DestinationPath ..\loop-financial-flow-v4-8 `
  -Force

cd $HOME\Documents\Loop

python .\loop-financial-flow-v4-8\apply-loop-financial-flow-v4-8.py

git diff --check

cd .\loop_work
npm run typecheck
```

If clean:

```powershell
cd $HOME\Documents\Loop

powershell -ExecutionPolicy Bypass `
  -File .\loop-financial-flow-v4-8\stage-loop-financial-flow-v4-8.ps1

git commit -m "Streamline spending entry and explain savings decisions"
git push origin main
```

Do not stage `.pre-flow-v4-8.bak` files or extracted package folders.
