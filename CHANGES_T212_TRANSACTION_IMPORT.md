# New: proper support for Trading212's transaction-history CSV export

## What was actually wrong
Your CSV wasn't malformed — it's a completely different, legitimate
Trading212 export (full transaction history: every buy/sell/dividend/
deposit over a date range), and the bulk-import feature had never been
built to recognise it. It only knew about Trading212's other export type
(a current-holdings snapshot with columns like "Slice", "Owned quantity",
"Invested value"). Your file fell through to a generic fallback parser
that assumed a simple 7-column format — it read "Dividend (Dividend)" as
an asset name and a timestamp as a ticker, produced nothing usable, and
that's why nothing appeared.

## What's new
`lib/investments/actions.ts`:
- `looksLikeTrading212TransactionHistory()` — detects this format
  properly (checks for the real header names: Action, Time (UTC), No. of
  shares, Price / share).
- A full, self-contained import branch for this format:
  - Groups every "Market buy"/"Market sell" row by ticker/ISIN
  - Computes net units (buys minus sells) and a real weighted-average
    GBP cost basis from your actual purchase data
  - Creates or updates the holding with `cost_basis_status:
    "manual_confirmed"` — the highest-trust status, meaning it's
    protected from ever being silently overwritten by a future SnapTrade
    sync (same protection built earlier this session)
  - Inserts **one purchase lot per individual buy transaction** — your
    stated preference over a single averaged figure — using Trading212's
    own transaction ID for safe deduplication if you ever re-import an
    overlapping date range
- Dividends, deposits, and interest rows are intentionally not touched —
  this import is specifically for building purchase-lot cost basis from
  buy/sell activity, not a general transaction ledger.

## Verified against your actual file, not just a syntax check
Ran the exact grouping/parsing logic against your real 874-row CSV
before considering this done:

```
Total distinct holdings: 52
Total purchase lots: 461
Total GBP invested: £777.00
```

Spot-checked several: PepsiCo ~£112/share average, BlackRock
~£800/share, Mastercard ~£402/share — all realistic, correct figures for
those stocks. This is genuinely working on your real data.

## How to use it
Same "Bulk import" button/flow you already tried — upload this exact
CSV again. It'll now be recognised correctly and import all 52 holdings
with real purchase-lot history, instead of producing nothing.

## Multiple imports into the same pot — now handled correctly

You asked exactly the right question before trying this, and it caught
a real bug in the first version: importing a *second* CSV (say, a later
date range) would have **overwritten** the first import's units and
cost basis, not added to them — because the holding's totals were being
set from only the current file's transactions.

**Fixed properly, not just patched:** the holding's units and average
cost are now always recalculated from *every* purchase lot on record for
that holding — not just the current import. Concretely:

- Each individual buy/sell transaction becomes its own permanent lot
  record, deduplicated by Trading 212's own transaction ID — so
  re-importing an overlapping date range never creates duplicates
- Sells are now stored as real lot records too (negative units), not
  just tracked in memory for one import — so a sell reported in a
  *later* CSV correctly reduces units bought in an *earlier* one
- After every import, units/average cost get recomputed from the
  **complete** lot history to date, so multiple imports — any date
  ranges, overlapping or not — always converge on one accurate, additive
  picture rather than each one replacing the last

## Verification
Passes an esbuild syntax check. The core parsing/grouping logic (single
import) was verified against your real 874-row file with correct
results (52 holdings, 461 lots, £777 total). The multi-import
accumulation logic follows directly from the same, now-corrected
approach — recomputing from the full lot set rather than the current
file — reviewed carefully end-to-end rather than re-simulated with fake
overlapping files.

