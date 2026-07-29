# Feature gating and Render cron

Feature switches now have three enforcement layers:

1. Account settings persist explicit booleans in `app_user_profiles`.
2. Navigation reads `/api/user/features` and hides House or Investments/Pensions when disabled.
3. Direct route access is blocked server-side and redirects to Account → Wealth without querying module data.

Turning a feature off hides its navigation and prevents its personalised background matching, but does not delete historical records. Turning it back on restores the module and existing data.

Use `render.cron-only.yaml` when creating the scheduled Render services. Render cron schedules are UTC; the savings job runs at both 07:00 and 08:00 UTC and the application permits only the invocation corresponding to 08:00 Europe/London.
