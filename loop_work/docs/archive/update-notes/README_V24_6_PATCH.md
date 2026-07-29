# V24.6 stable auth, household, invites and maternity patch

Run `db/v24_6_stable_auth_household_invites_maternity.sql` after installing.

This patch hardens the household RLS policies, fixes branded reset/update-password handling, adds a token-based person invite/claim flow, adds a more accurate NHS spread occupational + actual SMP maternity mode, and adds a dashboard fallback for income rows that are linked by person rather than user.
