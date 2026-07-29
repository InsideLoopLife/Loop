# V28.27 Household, income and people repair

## Fixes

- Dedupes adult/partner profiles in household selectors and family tree.
- Reattaches existing child profiles to the active household so Oakley/Myla show in the family tree and financial-flow selectors.
- Repoints person-linked records from duplicate people to the canonical person row.
- Broadens household financial reads to include active household-member records while the v28.26 visibility migration catches up.
- Removes the duplicate/simple Financial Flow calendar; only the detailed in/out calendar remains.
- Moves student-loan balance management onto the Income page and adds household visibility for `student_loan_accounts`.
- Reworks the Income page around person income cards, selected-person filtering, current income breakdown, student loan balances and income-change history.
- Adds delete confirmations for income and financial-flow deletes.

## SQL to run

Run `db/v28_27_household_people_income_student_loan_fix.sql` after v28.26.
