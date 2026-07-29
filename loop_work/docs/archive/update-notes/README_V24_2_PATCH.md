# V24.2 patch notes

This patch tightens the person/household model and improves the investment ownership flow.

## Apply migration

Run this in Supabase SQL Editor:

```txt
db/v24_2_people_investments_avatar_salary.sql
```

## Key changes

- People page now presents a family-tree style household view.
- Verified/linked accounts show a tick beside the person name.
- Profile images upload to a dedicated `person-avatars` Supabase Storage bucket, with a local data-URL fallback for dev.
- Pay events, including maternity pay, now always expose payment-date rules: fixed day, last working day, and weekend/bank-holiday handling.
- Dashboard pay-event query is more tolerant if an earlier timing migration was skipped.
- Investments now show person ownership badges on pension/investment pots.
- Add pension/investment/defined-benefit pot now defaults to the selected person if a person filter is active, reducing accidental Household-owned pots.
- Defined benefit pensions are filtered by selected person.
- Trading 212 pie import is only shown for Trading 212 pots.

## Note on profile images

Images are limited to 5MB. For production, use the Supabase Storage bucket rather than database data URLs. This patch creates a public avatar bucket for non-sensitive profile pictures only; do not store financial documents there.
