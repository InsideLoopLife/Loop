# Multi-service import: Trading212 + Revolut, extensible for more

## Direct answer to "do imports work from all services"
Before this: no, only Trading212 had real parsing — Revolut was named in
the UI but nothing in the code actually understood its format. Now
Revolut has genuine, dedicated parsing too, built the same careful way
the Trading212 fix was (GFIN-collision protection, duplicate quarantine,
multi-import accumulation — all reused, not rebuilt).

## Honest caveat, worth reading before trusting this fully
Trading212's format was built and verified against your own real
uploaded CSV files. Revolut's format is based on **two independent
third-party sources** describing Revolut's actual export columns
(`Date, Ticker, ISIN, Type, Quantity, Price per share, Total Amount,
Currency`) — solid, converging documentation, but not a real file I've
tested against. If you get a genuine Revolut export, worth trying it
and telling me what actually happens — if any column name or "Type"
wording (I assumed "Buy"/"Sell") doesn't match, that's a quick fix once
I can see the real thing.

## What's shared vs. what's service-specific
Everything downstream of reading a row — grouping by ticker, the
GFIN/THG-style exchange-collision protection, the duplicate-quarantine
check, multi-import accumulation, purchase-lot creation — is completely
shared, untouched code. Only the actual column-reading step is
service-aware. This matters for two reasons: it means Revolut
automatically gets all the same safety fixes T212 already has, and it
means adding a third service later is a small, contained change, not a
rewrite.

## One real, meaningful difference between the two services
Trading212's "Total" column is already in your account's own currency.
Revolut's "Total Amount" is in the trade's native currency (whatever
the "Currency" column says) — genuinely needs real FX conversion, which
this uses the existing `fxToGbp` helper for, rather than assuming it's
already GBP.

## Revolut has no stable per-transaction ID
Unlike Trading212, Revolut's documented export doesn't have an
equivalent to Trading212's `ID` column. Rather than invent a fake one,
this is left blank — which means the duplicate-quarantine system (built
specifically for exactly this "can't confirm by ID" scenario) correctly
holds re-imported Revolut transactions for your review, rather than
either blindly trusting or blindly skipping them on a second import.

## Adding a future service (Freetrade, Hargreaves Lansdown, etc.)
Follow the same pattern: a `looksLikeXTransactionHistory(headers)`
detector, add it to `detectImportService()`, and add a branch in the row
loop for its specific column names. Everything else — the actual hard
part — is already built and shared.

## File
```
lib/investments/actions.ts
```

## Verification
Passes a fresh esbuild syntax check.
