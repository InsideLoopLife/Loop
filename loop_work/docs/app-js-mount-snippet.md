# Mounting in `src/app.js`

Add this import near the other route imports:

```js
const tierEntitlementRoutes = require('./routes/tierEntitlements');
```

Then mount it near the other admin routes, before the final `/api/admin` route:

```js
app.use('/api/admin/tier-entitlements', tierEntitlementRoutes);
app.use('/api/admin', adminRoutes);
```

Recommended position in your current file:

```js
app.use('/api/admin/review-migrations', reviewMigrationRoutes);
app.use('/api', publicRoutes);
app.use('/api/admin/loyalty', loyaltyRoutes);
app.use('/api/admin/tier-entitlements', tierEntitlementRoutes);
app.use('/api/admin', adminRoutes);
```
