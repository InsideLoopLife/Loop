# LOOP Financial Flow V4.9

Fixes the 26 Aug Spending/Savings issues:

- optimistic/AJAX-style deletion for spending lines/categories
- bulk selected deletion
- exact summary/detail route prefetching
- real savings-rate catalogue instead of permanent "Checking"
- 1Y / 2Y / 5Y / Max savings trend with pulse and hover-only point marker
- interactive savings allocation by account vs needs
- default 3-month emergency fund view, with 6-month toggle
- pot shortfalls
- visible mojibake cleanup

## Apply

```powershell
cd $HOME\Documents\Loop\loop_work

Expand-Archive `
  -Path .\loop-financial-flow-v4-9.zip `
  -DestinationPath ..\loop-financial-flow-v4-9 `
  -Force

cd $HOME\Documents\Loop

python .\loop-financial-flow-v4-9\apply-loop-financial-flow-v4-9.py

git diff --check

cd .\loop_work
npm run typecheck
```

Do not stage until typecheck is clean.
