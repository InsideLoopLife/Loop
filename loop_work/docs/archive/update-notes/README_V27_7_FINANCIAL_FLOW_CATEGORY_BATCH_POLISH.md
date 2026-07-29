# v27.7 Financial Flow category/batch polish

## What changed

- Dashboard outgoing split cards can now be clicked again to clear the selected person/household filter.
- Selected cards now use a border/glow only; the background no longer turns orange.
- Wording is softer: the dashboard uses payment/outgoing language instead of “committed lines”.
- Dashboard cards now show category breakdowns, e.g. subscriptions, bills, car/transport.
- Financial Flow lines now keep a consistent row height and show the payment day more prominently.
- Drop-off, renewal and review notes now sit under the payment date instead of only being hidden in hover text.
- Line helper text now shows the category rather than “planned monthly outgoing”.
- Category icons are supported and selectable when creating a category.
- Financial Flow edit mode now supports multi-select batch category updates for planned items and one-off spends.
- Financial Flow line images now fall back in this order: bill logo, category icon, then person avatar/initial.

## Migration

Run:

```sql
\i db/v27_7_financial_flow_category_batch_polish.sql
```

or paste the contents into Supabase SQL editor.
