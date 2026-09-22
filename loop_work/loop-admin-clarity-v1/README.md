# LOOP Admin Clarity v1

This pack:
- replaces admin tabs with selectable cards;
- replaces the old `/admin` dashboard with a job-led admin home;
- adds `/admin/features` as a plain-English internal feature catalogue;
- adds `/features` as a customer-facing feature explainer;
- renames Overview → Admin home, Users → User access, Tiers → Plans & pricing;
- adds a dedicated Features admin area.

The production Supabase catalogue has already been updated with customer-friendly feature wording, customer benefit copy, and a `customer_visible` flag. Internal implementation controls such as duplicate SnapTrade entitlement rows remain active for backend enforcement but are excluded from the customer plan comparison.

## Install

Extract the ZIP, then run from PowerShell:

```powershell
cd C:\Users\danie\Documents\Loop\loop_work
& "PATH_TO_EXTRACTED_FOLDER\install-admin-clarity.ps1" -RepoRoot "C:\Users\danie\Documents\Loop\loop_work"
git diff --check
git status
git add app/admin/page.tsx app/admin/features/page.tsx app/features/page.tsx components/admin/AdminTabs.tsx lib/navigation/sections.ts
git commit -m "Simplify admin navigation and add feature catalogue"
git push origin main
```

Do not use `git add .` because your parent Loop folder contains old untracked update folders.
