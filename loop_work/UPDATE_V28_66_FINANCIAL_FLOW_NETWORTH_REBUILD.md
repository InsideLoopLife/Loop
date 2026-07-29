# v28.66 — Financial Flow + Net Worth two-panel rebuild

## User-facing changes

### Financial Flow
- Added a new top-level `/financial-flow` page.
- Consolidated the main wealth navigation so Income, Spending and Savings sit under one nav item: **Financial Flow**.
- The page has three large internal sections: **Income**, **Spending**, **Savings**.
- Added a person/household selector so the flow can be isolated to a member or viewed across the household.
- Added a visual flow/Sankey-style money map:
  - total monthly inflow
  - committed spending
  - savings/investments/pension
  - leftover cash
  - category rows with real amounts and effective percentages
- The Financial Flow page reads from current Loop tables rather than using hard-coded demo data:
  - `pay_events`
  - `income_entries`
  - `planned_items`
  - `spending_categories`
  - `financial_accounts`
  - `pension_accounts`

### Navigation
- Replaced the separate visible wealth nav entries for Savings, Income and Spending with one visible item: **Financial Flow**.
- Existing pages `/accounts`, `/income`, and `/spending` are still present and can be linked from settings/admin/deep links, but they are no longer separate primary nav items.

### Net Worth
- Rebuilt the net worth screen around a two-block view:
  - left: **Your net worth**
  - right: **Household net worth**
- The personal panel no longer treats household/shared rows as if they are owned personally.
- Added clear household status copy: a selected adult member shows as already part of the household and not awaiting duplicate invites.
- Added grouped personal asset rows for cash, investments and pension, with detailed items still available below.

## Household duplicate/invite fixes

### Frontend/query fixes
- Net worth now fetches people using `householdPeopleOrFilter` and runs `dedupeHouseholdPeople` before rendering chips.
- This prevents duplicate people such as two `Beth` chips appearing in net worth.

### Invite notification suppression
- `processPendingHouseholdLinksForUser` now checks active household memberships before surfacing invite notifications.
- If the user is already an active member of the household, existing household invite notifications for that household are dismissed instead of being shown again.
- `/household/join` now checks whether the user is already an active member before trying to accept the invite again.
- Notification unread counts and the notification hub call `app_cleanup_household_invite_state` to remove stale duplicate household invite nudges.

## Database migration

Added migration:

```text
supabase/migrations/202607071720_financial_flow_networth_household_dedupe.sql
```

It does three things:
1. Marks duplicate active household people as `duplicate_merged`.
2. Adds partial unique indexes to prevent duplicate active adult/child household profiles returning.
3. Adds `app_cleanup_household_invite_state(p_user_id uuid)` to dismiss invite notifications when the user is already an active household member.

## Files changed

- `app/financial-flow/page.tsx`
- `components/Nav.tsx`
- `lib/navigation/sections.ts`
- `app/net-worth/page.tsx`
- `components/net-worth/NetWorthClient.tsx`
- `lib/auth/invite-linking.ts`
- `app/household/join/actions.ts`
- `app/api/notifications/unread-count/route.ts`
- `app/notifications/page.tsx`
- `supabase/migrations/202607071720_financial_flow_networth_household_dedupe.sql`

## Notes

- The initial generated screenshots were used as the design direction, but the implemented page uses Loop’s existing live tables and routes.
- Build/typecheck could not be fully verified in the sandbox because the uploaded package does not include `node_modules`; running TypeScript immediately fails on missing Next/React/lucide types before app-specific validation.
