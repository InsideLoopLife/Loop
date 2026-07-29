# LOOP v27.43 Tier Entitlements — Hardened Beta Package

This package upgrades the first v27.43 tier manager into a safer beta-launch architecture.

## What changed vs the first package

- Admin-only tier configuration is separated from user-facing entitlement checks.
- `shopDomain` for admin writes must come from the admin session, not query/body input.
- Subscription `status` and `expiresAt` are enforced before access is granted.
- Expired/cancelled/past_due users fall back to the configured free fallback tier.
- Usage limits use atomic `usage_counters` so fast repeated requests cannot bypass limits.
- State limits support features like household members, shared profiles and watchlists.
- Admin changes are written to `entitlement_audit_logs`.
- Compatibility file remains at `src/routes/tierEntitlements.js`, but new installs should mount the split route files.

## Files

```txt
src/models/tierModels.js
src/services/entitlements.service.js
src/routes/adminTierEntitlements.js
src/routes/userEntitlements.js
src/routes/tierEntitlements.js              compatibility export
src/utils/entitlementsClient.js
public/tier-entitlements-admin.js
public/tier-entitlements-admin.css
scripts/verify-tier-entitlements.js
docs/*.md
```

## App mount

Add this to `src/app.js` near the other route imports:

```js
const adminTierEntitlementRoutes = require('./routes/adminTierEntitlements');
const userEntitlementRoutes = require('./routes/userEntitlements');
```

Mount the routes:

```js
app.use('/api/entitlements', makeRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: 'user-entitlements' }), userEntitlementRoutes);
app.use('/api/admin/tier-entitlements', requireAdminSession, adminTierEntitlementRoutes);
```

The admin route has its own `requireAdminSession` too; double protection is fine.

## Beta-safe settings

Keep these values until you are ready to enforce payment:

```txt
billingEnabled = false
enforcementEnabled = false
signupPaymentRequired = false
allowAllFeaturesDuringBeta = true
auditUsageWhileFree = true
```

This allows every feature but still records what users would have used and exceeded.

## User-facing feature check

For AI usage:

```js
const { checkEntitlement } = require('../services/entitlements.service');

const result = await checkEntitlement({
  shopDomain: req.shopDomain,
  userId: req.user.id,
  featureKey: 'ai_chat_messages',
  quantity: 1,
});

if (!result.allowed) return res.status(402).json(result);
```

For household member limits:

```js
const result = await checkEntitlement({
  shopDomain: req.shopDomain,
  userId: req.user.id,
  featureKey: 'household_members',
  currentValue: proposedMemberCount,
});
```

## Live-release gap

This package prepares the entitlement engine, but Stripe still needs to be wired separately:

- checkout sessions
- webhook signature verification
- subscription lifecycle sync
- payment failure handling
- cancellation/downgrade flows
