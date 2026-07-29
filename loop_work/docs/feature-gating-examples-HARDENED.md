# Hardened feature gating examples

## AI message usage limit

```js
const { checkEntitlement } = require('../services/entitlements.service');

const gate = await checkEntitlement({
  shopDomain: req.shopDomain,
  userId: req.user.id,
  featureKey: 'ai_chat_messages',
  quantity: 1,
  meta: { endpoint: 'ai-chat' },
});

if (!gate.allowed) {
  return res.status(402).json({
    error: 'upgrade_required',
    message: gate.entitlement?.upgradeMessage || 'Upgrade to continue using AI.',
    gate,
  });
}
```

## Household member state limit

```js
const proposedMemberCount = existingMembers.length + 1;
const gate = await checkEntitlement({
  shopDomain: req.shopDomain,
  userId: req.user.id,
  featureKey: 'household_members',
  currentValue: proposedMemberCount,
  meta: { householdId },
});

if (!gate.allowed) return res.status(402).json(gate);
```

## Browser pre-check

```js
const response = await fetch('/api/entitlements/check', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ featureKey: 'realtime_market_data' }),
});
const gate = await response.json();
```
