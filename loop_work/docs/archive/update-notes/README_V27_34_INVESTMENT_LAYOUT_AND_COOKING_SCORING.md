# V27.34 – Investment layout + manual refresh + cooking-aware scoring

## Investment updates

- Investment pot header now includes a compact sparkline beside the pot value/gain/fee cards.
- Clicking the compact pot chart expands/collapses the larger pot history chart.
- Each holding row now uses a three-part layout:
  - holding/share/fund details on the left
  - compact historical value chart in the centre
  - current value and gain/loss actions on the right
- Added a **Refresh prices** button beside **Add pot**.
- Manual refresh calls a server action that loops through the signed-in user's holdings with tickers, refreshes delayed/current quotes using existing market-data logic, updates latest prices and inserts a new `investment_price_snapshots` row.
- SVG charts are still dependency-free; no `chart.js` install is required.

## Nutrition scoring updates

- Merged the supplied `scoring.ts` logic.
- Refined processed-load scoring so powdered energy drinks/G Fuel-style products, artificial flavourings/colourings, maltodextrin, sweeteners and functional blend wording are treated as high processed load even when calories are low.
- Added cooking-aware recipe estimate notes/adjustments:
  - cooked eggs retain calories/protein but receive small heat-sensitive B12/vitamin D adjustments
  - cooked vegetables receive a vitamin C reduction estimate
  - fried/sautéed/scrambled ingredients add a small absorbed-oil allowance if no explicit oil/butter line exists
  - spaghetti/dry pasta in recipe ingredients is treated as dry pasta rather than cooked pasta by default

## Files changed

- `components/investments/PensionsInvestmentsClient.tsx`
- `components/investments/InvestmentHistoryChart.tsx`
- `app/investments/actions.ts`
- `lib/nutrition/scoring.ts`
