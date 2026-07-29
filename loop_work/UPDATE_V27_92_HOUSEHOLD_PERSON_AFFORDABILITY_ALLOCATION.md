# LOOP v27.92 — Household person / house affordability allocation fix

This release fixes the duplicate claimed-household profile issue and tightens House affordability to use household income sources rather than only the signed-in user.

## Fixes

- Household tree now reads canonical household-owner people rows instead of showing a member's private self-profile and the household representation side-by-side.
- SQL migration merges duplicate claimed-member people rows and moves references to the canonical row before archiving duplicates.
- House page now de-dupes people shown in ownership assignment.
- House ownership can store percentage overrides again; blank percentages auto-split the remainder equally.
- House/mortgage actions now write to the household data owner, so linked household members can update shared House records where permissions allow.
- House affordability now reads pay events, manual income, planned costs, categories, child costs and savings balances across active household members.
- Manual income entries are included in the House affordability income count.
- Maternity/leave income labels now contribute to dual-income detection when a second adult has a tracked pay event or manual income entry.

Run `db/v27_92_household_person_affordability_allocation_fix.sql` after deployment.
