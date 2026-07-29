# Notifications

Notifications are split into channels so the user can separate practical household actions from weekly nudges.

## Channels

- **Household**: household invites, food/profile allocation approvals, account-sharing items.
- **Wealth**: investments, stock progress, spending, renewals and affordability insights.
- **Lifestyle**: LoopHealth, nutrition, food logging and weekly health-pattern insights.
- **System**: background imports and general operational messages.

## Priority order

1. Household invites.
2. Approval/action-required notifications.
3. Urgent/warning items.
4. Weekly insights and general nudges.

## Weekly insights

The scheduled endpoint is:

```text
/api/cron/notification-insights
```

It requires `CRON_SECRET` and creates in-app notification cards for investment progress and nutrition trends.
