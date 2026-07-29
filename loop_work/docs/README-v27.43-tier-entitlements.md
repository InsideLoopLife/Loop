# LOOP v27.43 — Tier Entitlements & Payment-Ready Admin

This package adds a payment-ready tier engine while keeping everything free during beta/testing.

## Files

- `src/routes/tierEntitlements.js` — Express/Mongoose admin API and entitlement checker.
- `public/tier-entitlements-admin.js` — admin UI component.
- `public/tier-entitlements-admin.css` — admin UI styles.
- `src/utils/entitlementsClient.js` — example helper for feature checks.
- `docs/app-js-mount-snippet.md` — exact changes for `src/app.js`.
- `docs/admin-html-snippet.md` — exact admin page snippet.

## What it creates in MongoDB

- `tiers`
- `tier_entitlements`
- `user_tiers`
- `usage_events`
- `billing_settings`

## Default launch mode

The default is safe for testing:

```txt
billingEnabled: false
enforcementEnabled: false
signupPaymentRequired: false
allowAllFeaturesDuringBeta: true
auditUsageWhileFree: true
```

That means all users can access all features, but usage can still be audited.

## Default tiers

- Free
- Plus
- Pro
- Staff

## Default features

- AI chat messages
- Food photo scans
- Household members
- Shared profiles
- Realtime market data
- Watchlist items
- Advanced health insights
- Data export

## Route mounting

Mount this under:

```txt
/api/admin/tier-entitlements
```

## Enforcement pattern

Every protected action should call:

```js
POST /api/admin/tier-entitlements/check
```

Example body:

```json
{
  "userId": "user_123",
  "featureKey": "ai_chat_messages",
  "quantity": 1,
  "meta": { "source": "health-coach" }
}
```

While beta/free access is enabled, the response will allow the action but still record usage.
