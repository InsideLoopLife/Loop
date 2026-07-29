# LOOP v28.84 — navigation choice, account modal and restored domains

## Changes

- Restored Financial Flow as a first-class Wealth navigation item.
- Restored the Wealth / Health switch in both top and side navigation modes.
- Side navigation now shows the links for the selected domain rather than mixing both lists.
- Replaced the clipped sidebar Account flyout with a viewport-level modal.
- The Account modal includes quick links, notifications, household, help, plan, admin, sign out and the layout switch.
- Added a mandatory one-time top-versus-side layout choice after sign-in.
- Added the same layout control to Account → Personal so it can be changed later.
- Preferences remain server-backed and are mirrored locally for immediate rendering.

## Migration

Run:

`supabase/migrations/202607130945_navigation_layout_choice_tracking.sql`

The new nullable timestamp lets LOOP distinguish an old default from an explicit user choice.
