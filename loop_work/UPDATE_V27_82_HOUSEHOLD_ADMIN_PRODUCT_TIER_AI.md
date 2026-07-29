# UPDATE V27.82 — Household access, admin fixes, product quality, tier AI routing

## Code changes

- Added an app-wide linked-household fallback in `lib/auth/household-context.ts` so claimed `people.linked_user_id` profiles can resolve back to the household owner even when the membership row is missing/incomplete.
- Fixed `/household/[personId]` lookup so linked/claimed users can open their profile row instead of seeing a 404.
- Moved Accounts, Mortgage and Investments to the household data-owner context so linked household data can be read from the shared household owner store.
- Added household approval notifications when pension/investment pots are created/edited for a linked household member.
- Mortgage ownership now supports household member allocation and per-person ownership percentage overrides.
- Pension pots now have an edit flow and reinforced NI top-up logic: fixed percentage and actual salary-sacrifice/NI-saved amount are separated in the UI.
- Main content is capped to 2000px via `app/globals.css` while retaining responsive spacing.
- Admin environment/runtime issue cards now include a `Fix` modal button with explanation and suggested env/SQL snippets.
- Admin Users receives a replacement SQL RPC to fix `column reference "user_id" is ambiguous`.
- Product quality now reads all products via a left-joined product RPC rather than only showing populated quality snapshots.
- Product quality cards include search, score filter, sort and editable quality override fields.
- Investment coverage page now has an AI coverage planner that creates planned market rows and stores generated Supabase SQL.
- Added admin Tier tab with AI route/model/key configuration per tier.
- Added model routing helper: `lib/ai/model-routing.ts`.

## SQL required

Run this migration in Supabase:

```sql
-- db/v27_82_household_admin_product_tier_ai.sql
```

It replaces:

- `loop_admin_users_list(integer)`
- `loop_admin_products_list(integer)`

It adds:

- `loop_ai_model_routes`
- `loop_tier_ai_model_config`
- `loop_investment_ai_market_requests`
- safe helper functions for numeric/timestamp parsing

## Notes

The household approval flow currently lands as a household notification and uses the existing accept/decline notification actions. The next deeper phase should move accepted pending changes into a dedicated `app_household_change_requests` ledger if you want field-by-field approvals and audit history.
