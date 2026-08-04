# Never show a price/gain until it's actually been verified

## The problem, precisely
THG's genuine ticker collision (THG plc, LSE, vs. Hanover Insurance
Group, NYSE — both ticker THG) caused the import to briefly pull the
wrong company's price. That's now fixed at the source (previous
delivery). But the deeper issue you spotted is real regardless of that
specific bug: **nothing stopped a placeholder or wrong price from being
displayed as if it were verified.**

## What's fixed here

**`lib/investments/actions.ts`** — the transaction-history import now
explicitly records whether a real price was actually found
(`price_check_status: "ok"` vs `"quote_not_found"`), instead of leaving
this unset when falling back to a placeholder.

**`components/investments/PensionsInvestmentsClient.tsx`** — three
places now check this status before showing a computed gain:
- The allocation tiles (exactly where your screenshot showed
  "+52344.8%") now show a small amber "Processing" pill with a spinner
  instead of a percentage, when the price has never been verified.
- The per-holding value/gain display reuses the app's existing
  "unreliable" fallback path (already used for unverified cost basis) —
  extended to also cover unverified price, with an accurate label
  ("Processing — price not yet verified" rather than the misleading
  "Cost price missing", since THG's cost basis was actually fine).
- The pot/group-level total also treats an unverified-price holding as
  reason to flag the whole group's P&L as unreliable, so a distorted
  contributor can't quietly skew a group total either.

## Deliberately precise, not blanket
This only triggers for `price_check_status === "quote_not_found"` —
genuinely never-verified. An established holding with a perfectly good
last-known price that simply failed *today's* refresh attempt keeps
showing its last-known figures as normal — this doesn't regress that
case into a false "processing" state.

## What happens once a real price comes through
The very next successful price check (worker or manual "Check price")
sets `price_check_status` to `"ok"` — this is already how the existing
price-refresh code behaves, confirmed by checking
`price-snapshot-runner.ts`. Nothing extra needed there; the pill clears
itself automatically.

## Verification
Both files pass a fresh esbuild syntax check.
