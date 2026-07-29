# v27.93 audit hardening

This update was created after a code audit of the v27.92 household/affordability package.

## Fixes included

- Account profile image upload now uses the Ajax upload control on the account page.
- Header avatar preview updates immediately when the image upload completes.
- Household person dedupe now prefers linked user ID over email once a claimed account is resolved.
- Household page fills missing email from the linked profile before deduping, fixing the case where one row had an email and another had only a linked user ID.
- Mortgage/House person dedupe now uses the same linked-user-first identity key.
- Month-plan lines now carry `personId`, so affordability can detect dual-income households by actual person IDs rather than only label text.
- House affordability now uses selected home owners with income person IDs to classify single/dual income more reliably.
- SQL migration backfills missing linked user/email/name/avatar fields using `email` and `invite_email`.
- SQL migration moves references away from duplicate people rows before archiving them.
- SQL migration auto-splits ownership where multiple owners exist but percentages were left blank.

## Run order

Run after v27.92:

```sql
db/v27_93_household_identity_affordability_hardening.sql
```
