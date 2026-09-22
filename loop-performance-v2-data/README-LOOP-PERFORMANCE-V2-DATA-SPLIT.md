# LOOP Performance V2 — Data Split

This tranche adds safe stale-while-refresh and targeted route data splitting.

- Dashboard, Investments, Net Worth, Retirement, Income and Nutrition can show a last-known display-only snapshot while fresh data loads.
- Cached screens are `pointer-events-none`, so stale forms/actions cannot be triggered.
- Investments caches only core account/holding/pension state and lazy-loads the two largest visual modules.
- Financial Flow skips the 1,500-row savings movement query outside the Savings tab.
- Accounts loads pension performance assumptions only on Projection, and pot movement threads only on Overview/Pots.
- House keeps its existing V2 cached fallback.

No DB schema, mortgage maths, tax/NI, maternity, ISA, pension valuation, savings accrual or ownership logic changes.

Apply:

```bash
cd /workspaces/Loop/loop_work
unzip -o ./loop-performance-v2-data-split.zip -d /tmp/loop-performance-v2-data

cd /workspaces/Loop
python3 /tmp/loop-performance-v2-data/apply-loop-performance-v2-data-split.py
git diff --check

cd /workspaces/Loop/loop_work
npm install
npm run typecheck
```

If clean, use the targeted `git add` list from ChatGPT / this package's changed files, then commit and push. Never use `git add .`.
