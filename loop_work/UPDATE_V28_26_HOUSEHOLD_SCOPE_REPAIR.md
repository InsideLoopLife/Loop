# v28.26 Household Scope Repair

This update restores the intended household model:

- User-owned records can now be visible to an active household through `household_id` + `visibility_scope`.
- Children/dependants are treated as household people, not isolated account-only records.
- Partner accounts can accept an invite, join the household, and choose what historical data to share.
- Shared household dashboards/pages now query active household-visible records instead of only `created_by_user_id` / `user_id` rows.
- Duplicate children in a household are merged by household/name/birth date and related records are moved to the canonical child profile.
- Admin/creator/owner/visibility fields are separated using `created_by_user_id`, `owner_user_id`, `household_id`, and `visibility_scope`.

## Main files changed

### Root app

- `lib/auth/household-context.ts`
- `app/household/page.tsx`
- `app/household/actions.ts`
- `app/household/[personId]/page.tsx`
- `app/household/join/page.tsx`
- `app/household/join/actions.ts`
- `app/dashboard/page.tsx`
- `app/income/page.tsx`
- `app/income/actions.ts`
- `app/spending/page.tsx`
- `app/spending/actions.ts`
- `app/accounts/page.tsx`
- `app/accounts/actions.ts`
- `app/account/actions.ts`
- `app/affordability/page.tsx`
- `app/mortgage/page.tsx`
- `app/mortgage/actions.ts`
- `app/net-worth/page.tsx`
- `app/net-worth/actions.ts`
- `app/lifestyle/page.tsx`
- `app/lifestyle/actions.ts`
- `components/SectionCard.tsx`

### Nested duplicate app under `db/components`

- `db/components/lib/auth/household-context.ts`
- `db/components/app/household/page.tsx`
- `db/components/app/household/actions.ts`
- `db/components/app/household/[personId]/page.tsx`
- `db/components/app/household/join/page.tsx`
- `db/components/app/household/join/actions.ts`
- `db/components/app/dashboard/page.tsx`
- `db/components/app/income/page.tsx`
- `db/components/app/income/actions.ts`
- `db/components/app/spending/page.tsx`
- `db/components/app/spending/actions.ts`
- `db/components/app/accounts/page.tsx`
- `db/components/app/accounts/actions.ts`
- `db/components/app/account/actions.ts`
- `db/components/app/affordability/page.tsx`
- `db/components/app/mortgage/page.tsx`
- `db/components/app/mortgage/actions.ts`
- `db/components/app/net-worth/page.tsx`
- `db/components/app/net-worth/actions.ts`
- `db/components/app/lifestyle/page.tsx`
- `db/components/app/lifestyle/actions.ts`
- `db/components/components/SectionCard.tsx`

### Database

- `db/v28_26_household_scope_repair.sql`

## Deployment note

Run `db/v28_26_household_scope_repair.sql` in Supabase before deploying the app code. The app now expects shared data tables to have `household_id`, `visibility_scope`, `owner_user_id`, and `created_by_user_id`.

## Validation note

`npm ci --ignore-scripts` completed successfully in the root app. `npx tsc --noEmit` still reports pre-existing non-household issues in admin investment storage, nutrition, onboarding, wealth catalogue/tier files, and patch/example files. After this household patch there are no remaining TypeScript errors under the household/spending/income/accounts/mortgage/dashboard/net-worth/lifestyle files or `lib/auth/household-context.ts`.
