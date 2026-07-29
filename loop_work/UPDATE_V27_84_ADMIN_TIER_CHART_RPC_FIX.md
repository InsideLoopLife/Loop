# UPDATE V27.84 — Admin Tier Chart + RPC Repair

## Summary

This update fixes the Admin tier control experience so the admin sees and edits the same plan comparison chart that users see on `/account/plan`.

## Changed

### Admin → Tiers

- Replaced the separate ugly tier-card layout with the same user-facing comparison chart structure.
- Tier columns now have a cog/settings control.
- Feature rows now have an edit-row control.
- Each plan/feature cell can be clicked to edit:
  - enabled/disabled
  - limit value
  - limit period
  - enforcement mode
  - health/visibility status
  - user-facing helper message
- Added add-tier/column control.
- Added add-feature/row control.
- Added hide/delete row and hide/delete column actions.
- Added pending upgrade requests directly into Admin → Tiers.
- Added manual user upgrade controls directly into Admin → Tiers.

### User upgrade requests

- Pending requests now show with user email/display name where available.
- Approving a request immediately applies the plan using `app_admin_set_user_plan`.
- Rejecting a request records the rejection note.

### AI model lanes

- Customer AI budget lanes are now collapsed below the user-facing tier chart.
- System/admin AI lanes are collapsed and shown as compact route rows rather than large cards.

### Admin data RPC fixes

- Fixed `loop_admin_products_list` malformed array literal caused by appending SQL text to a `text[]` incorrectly.
- Fixed `loop_admin_product_imports_list` to be column-safe, avoiding missing-column errors such as `b.source_name does not exist`.
- Added admin RPCs for editing/hiding tier rows and columns.

### Product admin

- Product admin pages are capped at 2000px width.
- Product cards now show a clean product type pill, e.g. `Ingredient`, instead of raw import/source labels.

## SQL to run

Run:

```sql
-- db/v27_84_admin_tier_chart_rpc_fix.sql
```

This should be run after v27.83/v27.83.1.
