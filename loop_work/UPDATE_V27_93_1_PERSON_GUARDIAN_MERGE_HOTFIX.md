# LOOP v27.93.1 person guardian merge hotfix

This hotfix fixes the v27.93 migration failure:

`duplicate key value violates unique constraint person_guardians_child_person_id_guardian_person_id_key`

## Cause

The v27.93 household identity merge can collapse two `people` rows into one canonical person. If `person_guardians` already contains a relationship that becomes the same `(child_person_id, guardian_person_id)` pair after that merge — or if a child and guardian collapse into the same person — Postgres blocks the update because of the unique guardian-pair constraint.

## Fix

The corrected v27.93 SQL now:

- calculates the post-merge guardian pairs first;
- deletes rows that would become self-guardian rows;
- deletes duplicate post-merge guardian pairs before changing IDs;
- applies the person ID merge after the constrained table is safe.

## Run order

Run:

```sql
db/v27_93_1_person_guardian_merge_hotfix.sql
```

Then rerun:

```sql
db/v27_93_household_identity_affordability_hardening.sql
```
