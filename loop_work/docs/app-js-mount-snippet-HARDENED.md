# Hardened app.js mount snippet

```js
const adminTierEntitlementRoutes = require('./routes/adminTierEntitlements');
const userEntitlementRoutes = require('./routes/userEntitlements');
```

Place before the generic `/api/admin` route:

```js
app.use('/api/entitlements', makeRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: 'user-entitlements' }), userEntitlementRoutes);
app.use('/api/admin/tier-entitlements', requireAdminSession, adminTierEntitlementRoutes);
```

Do not mount user entitlement checks under `/api/admin`.
