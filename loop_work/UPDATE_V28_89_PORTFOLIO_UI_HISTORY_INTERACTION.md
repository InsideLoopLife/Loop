# LOOP v28.89 — Portfolio UI, history and interaction

This update applies the approved live-portfolio visual direction to the actual investment hub and strengthens the data behind it.

## Visible UI changes

- The portfolio chart and a persistent right-hand intelligence rail now form the primary desktop layout.
- The right rail switches between portfolio summary, missing cost basis and Other holdings without leaving the page.
- The missing-cost-basis notice is clickable and opens an inline editor showing ticker, units, current price and average purchase price.
- Other holdings opens as an inspectable, paginated rail rather than an unexplained residual bar.
- Diversification bars use width for portfolio weight and height/direction for the selected-period movement.
- Every movement bar is interactive: a named asset opens its detail view and Other opens the residual holdings rail.
- Asset imagery uses stored broker logos first, then recognised provider/company logos, then provider branding for funds/ETFs, and finally initials.

## Chart and period logic

The selectable periods are now 1D, 5D, 1M, 6M, YTD, 1Y, 5Y and MAX.

Portfolio history uses this hierarchy:

1. complete stored portfolio snapshots;
2. stored instrument price points;
3. direct delayed market history for unresolved top holdings;
4. a clearly labelled current-value baseline when evidence remains insufficient.

The API now supports one batched movement request for the represented assets instead of issuing a separate request for every holding. This gives the period controls real data while avoiding dozens of browser requests.

Where cash-flow-aware account snapshots are unavailable, LOOP labels the chart as a market-move estimate. It does not present purchases, sales or deposits as investment performance.

## Cost basis

- Holdings with missing, estimated or unverified cost basis are included in the review workflow.
- Provider invested value is used only as an editable suggestion where available.
- Saving an average purchase price updates the holding and creates or updates an auditable manual purchase lot.
- Failed saves stay visible and do not close the editor.

## Data integrity

- The portfolio headline prefers weighted instrument movement for the selected period.
- Diversification represents the entire visible portfolio, with smaller assets explicitly grouped under Other.
- Fund symbol resolution can use ticker, ISIN and known provider mappings.
- GPT is not used to invent price points. AI may explain verified movements later, but chart data remains deterministic and source-backed.

## Database

No new SQL migration is required for v28.89. It uses the fields and tables introduced by the previous investment integrity migrations.

## Validation

The changed investment page, client dashboard, history API and cost-basis server action pass targeted TypeScript validation.
