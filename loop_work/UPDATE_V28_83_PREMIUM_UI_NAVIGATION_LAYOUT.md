# LOOP v28.83 — Premium UI and navigation layout

- Reworked the global navigation to match the approved dark-side premium concept.
- Added user-selectable **Top** and **Side** navigation.
- Preference is saved to `app_user_profiles.ui_navigation_layout` and mirrored in local storage for immediate loading.
- Side navigation is entitlement-aware and hides disabled modules.
- Added wealth and health groupings, paid-plan status, notification state and account controls.
- Side navigation automatically becomes a mobile drawer on smaller screens.
- Added global visual tokens and spacing rules so existing pages inherit the cleaner pastel fintech presentation without rewriting every page.

Run migration:

`supabase/migrations/202607121530_navigation_layout_preference.sql`
