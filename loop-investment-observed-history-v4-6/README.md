# Investment observed history V4.6

This does NOT multiply per-user storage by writing a snapshot every minute for
every holding. LOOP already stores the shared market observation series at high
cadence. This patch makes holding charts consume that observed series, sampled
to the user's entitlement cadence.

```powershell
cd $HOME\Documents\Loop\loop_work
Expand-Archive -Path .\loop-investment-observed-history-v4-6.zip -DestinationPath ..\loop-investment-observed-history-v4-6 -Force

cd $HOME\Documents\Loop
python .\loop-investment-observed-history-v4-6\apply-loop-investment-observed-history-v4-6.py

git diff --check
cd .\loop_work
npm run typecheck
```
