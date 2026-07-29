# LOOP v28.85 — Wealth toggles, consolidated navigation and duplicate spend checks

## Navigation

- `Savings & Pots` is no longer a separate primary navigation item. Savings, pots, interest and savings context sit inside **Financial Flow**.
- `Pensions` and `Investments` are now one primary navigation item: **Pensions & Investments**.
- The same labels and structure are used by top and side navigation.
- User feature settings still gate the underlying routes and specialist data. The consolidated navigation does not bypass feature access.

## Account → Wealth

- Wealth module checkboxes are now switch-style toggles.
- Every toggle explains where its setup lives.
- Enabling a context item does not automatically create another main navigation tab.
- Student loan setup now lives in Account → Wealth. The Spending page links back to it rather than displaying a second full student-loan editor.
- Student loan balances continue to feed Financial Flow and wider calculations.

## Spending categories

Budget category cards now show cumulative activity for the selected period:

- the signed-in account holder's total; and
- the whole-household total.

The monthly budget remains visible as a separate reference value, including `Not set` where no budget exists.

## Duplicate expenditure check

The Financial Flow spending page now performs a cautious duplicate check for the selected month. It compares:

- record owner;
- normalised description;
- amount within a small tolerance; and
- payment dates within seven days.

Savings/investment transfers are excluded. Suspected lines are highlighted, but LOOP never deletes or merges expenditure automatically.

## Validation

The changed navigation, Account, feature-access, spending and tier files passed a targeted TypeScript check using `tsconfig.v28_85-check.json`. The temporary check file and local dependencies are not included in the release archive.
