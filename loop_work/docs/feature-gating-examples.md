# Feature gating examples

## AI chat

```js
await checkEntitlement({
  userId: req.user.id,
  featureKey: 'ai_chat_messages',
  quantity: 1,
  meta: { area: 'health-coach' },
});
```

## Household invite

```js
await checkEntitlement({
  userId: req.user.id,
  featureKey: 'household_members',
  quantity: nextHouseholdMemberCount,
  meta: { householdId },
});
```

## Realtime market data

```js
await checkEntitlement({
  userId: req.user.id,
  featureKey: 'realtime_market_data',
  quantity: 1,
  meta: { symbol },
});
```

## Suggested feature keys

```txt
ai_chat_messages
ai_food_photo_scans
ai_meal_plans
household_members
shared_profiles
child_profiles
realtime_market_data
delayed_market_data
watchlist_items
portfolio_accounts
health_advanced_insights
export_data
api_access
```
