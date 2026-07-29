# LOOP v28.58 - Savings rate intelligence, centred savings modals, family/school calendar parser polish

## Savings admin
- Added a clearer one-click admin run on `/admin/savings`:
  - refresh due savings source pages
  - extract savings rate/access/withdrawal/term fields
  - run user savings recommendations
  - expire stale savings rows
- Added active-deal review cards so admin can see what users will actually see.
- Added recent source check cards with errors/pending status.
- Cron route `/api/cron/savings-rate-watch` now runs the full catalogue-refresh + watch + expiry pipeline by default. Use `?mode=watch_only` to run only recommendations.

## Savings user side
- Savings account edit/owner/delete now opens in a centred modal instead of the small in-card popover.
- Balance/movement logging also opens in a centred modal.
- Better-rate watch cards now show richer information:
  - rate type
  - access type
  - notice period
  - fixed term length
  - minimum/maximum balances
  - monthly deposit cap
  - withdrawal/access note
  - source link

## Savings extraction/schema
- Added richer deal fields to `savings_rate_deals`:
  - `access_type`
  - `withdrawal_rules`
  - `notice_period_days`
  - `term_length_months`
  - `rate_type`
  - `source_payload`
- Savings recommendations now carry `action_summary` and `suitability_payload`.

## Family / school calendars
- Hardened the school-calendar parser to recognise numeric UK dates as well as named dates.
- Added a generic term-row parser for common school snippets/tables.
- LoopWatch now escalates documents with clear term-date/inset signals to `school_calendar` instead of leaving them as general contracts.
- LoopWatch calendar import now regenerates holiday periods from extracted term rows if a payload only contains terms.

## SQL to run
Run:

```sql
db/v28_58_savings_rate_intelligence_family_school_modal.sql
```
