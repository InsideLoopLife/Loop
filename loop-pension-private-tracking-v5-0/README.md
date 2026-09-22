# LOOP Pension Private Tracking V5.0

Adds private/manual pension UX, manual threads, and user-supplied 5Y / 10Y annualised returns.

Apply from Windows PowerShell:

```powershell
cd $HOME\Documents\Loop\loop_work

Expand-Archive `
  -Path .\loop-pension-private-tracking-v5-0.zip `
  -DestinationPath ..\loop-pension-private-tracking-v5-0 `
  -Force

cd $HOME\Documents\Loop

python .\loop-pension-private-tracking-v5-0\apply-loop-pension-private-tracking-v5-0.py

git diff --check

cd .\loop_work
npm run typecheck
```

Do not commit until typecheck is clean.
