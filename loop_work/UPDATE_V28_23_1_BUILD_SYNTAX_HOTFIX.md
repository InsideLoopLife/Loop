# v28.23.1 Build syntax hotfix

This patch fixes the Next/Turbopack build error in:

`components/investments/PensionsInvestmentsClient.tsx`

## Issue

The v28.23 investment accuracy update included this expression:

```ts
lot.total_cost ?? lot.units * lot.purchase_price || 0
```

JavaScript/TypeScript does not allow `??` to be mixed with `||` without explicit parentheses, so Next failed to parse the file.

## Fix

The cost-lot calculation has been expanded into readable, safe steps:

```ts
const explicitCost = Number(lot.total_cost ?? 0);
const units = Number(lot.units ?? 0);
const purchasePrice = Number(lot.purchase_price ?? 0);
const calculatedCost = units * purchasePrice;
const usableCost = explicitCost > 0 ? explicitCost : calculatedCost > 0 ? calculatedCost : 0;
```

## SQL

No new SQL is required for this hotfix.

If you have already run the v28.21 SQL successfully, do not rerun it unless you specifically need to reseed the source/task data.
