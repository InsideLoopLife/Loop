# v28.92 — Account, Wealth, Health and Market code boundaries

- Added domain-first folders without changing database schemas or routes.
- Moved Account, Financial Flow, Investments, House, Nutrition and Lifestyle page implementations behind thin route adapters.
- Centralised signed-in user, household and feature access checks.
- Added private-by-default resource access rules for Health.
- Separated user, browser, admin and named worker database clients.
- Moved popular shared price lookup behind the Market repository.
- Added compatibility exports so legacy modules continue to compile.
- Added an automated domain-boundary check.

No Supabase migration is required.
