# v28.01 — Integration entitlement gates

This update locks provider integrations behind tier/feature permissions while still allowing safe clean-up of existing imported data.

## What changed

- Account → Integrations is hidden unless the user has an eligible integration/realtime tier, is an admin, or has existing provider/imported/archived data to manage.
- Direct visits to `/account?tab=integrations` show a locked upgrade panel for users without access.
- Users who lose access can still remove SnapTrade/provider access and restore archived manual investment pots.
- SnapTrade API routes now check entitlement server-side before registering users, opening the connection portal, fetching accounts or importing holdings.
- Added a shared entitlement helper so UI and API routes use the same logic.
- Seeded a configurable `provider_integrations` tier feature without overwriting existing Admin → Tiers edits.

## SQL

Run:

```sql
db/v28_01_integration_entitlement_gates.sql
```

## Expected behaviour

- Free/locked users do not see normal integration management.
- Pro/realtime/enterprise users can connect SnapTrade and import accounts.
- Downgraded users can still disconnect provider access and reinstate manual archived pots.
