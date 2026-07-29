# v27.93 audit results

Audit performed after v27.92 to check the household duplicate-profile, house affordability, image upload and migration safety logic.

## Checks run

- TypeScript/TSX transpile smoke check over app, components and lib: passed.
- Reviewed household page canonical-person rendering: patched to resolve linked-user identity before email identity.
- Reviewed mortgage/house canonical-person rendering: patched to resolve linked-user identity before email identity.
- Reviewed account image flow: patched account page to use Ajax image upload and live avatar preview.
- Reviewed month-plan to affordability handoff: patched plan lines to carry person IDs and patched house affordability to count owner-linked income person IDs.
- Reviewed v27.92 SQL: patched the `home_owners.updated_at` assumption so it does not fail on older schemas.
- Added v27.93 SQL hardening migration for duplicate household identities, ownership split fallback and reference remapping.

## Remaining environment-dependent checks

A full Next build still needs local `node_modules` and the live Supabase schema. After deploying, run:

```bash
npm run build
```

Then run the SQL in Supabase:

```sql
db/v27_93_household_identity_affordability_hardening.sql
```

If v27.92 was not already run cleanly, use the corrected v27.92 file in this package first, then v27.93.
