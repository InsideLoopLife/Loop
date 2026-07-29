
# v27.47 — product label, finance overview and lifestyle UI polish

Run:

```sql
db/v27_47_product_finance_lifestyle_ui.sql
```

What changed:

- GFuel/Supplement Facts label scans now repair obvious zero-value OCR failures and apply the correct serving basis for GFuel Hype Sauce 2.0.
- Product label scanner now previews more nutrients before saving.
- Product/detail pages use saved/proxied product images instead of blanking on refresh.
- Recipe/card detail layout moved Method to the right side and makes right-side panels collapsible.
- Left side now shows a macro/micro nutrition transparency grid.
- Ingredients show a star button linking into ingredient intelligence/search.
- Wealth pages now include a cross-screen finance strip: Overview, Accounts, Income, Spending, Net worth, Mortgage, Investments.
- Account settings now include optional health baseline fields: height, weight, sex-for-targets, activity, goal and training load.
- Menu import now preserves page breaks, requests more output, and merges evidence-derived menu items so larger menus do not stop after a handful of items.

Important:

- Keep SnapTrade consumer keys only in `.env.local` and rotate any key pasted into chat or logs.
- Label OCR/AI still needs review before saving. The GFuel Hype Sauce patch is a safety repair for the known label image you supplied.
