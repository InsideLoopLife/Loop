# LOOP v27.88 — Investment ticker, provider-aware pensions, tier/beta fix

## Why
This update fixes three linked issues:

1. Exchange-traded holdings such as `NIO / NYSE` could inherit a provider-fund factsheet price/source and show a nonsensical stock price.
2. Pension providers need provider-aware flows. PensionBee is normally a pot/portfolio value, while NHS/other defined-benefit pensions are not unit-based investments.
3. Admin → Tiers could still fail inside Supabase RPCs with `Admin access required` even when the Next app admin allow-list allowed the user. Upgrade requests also needed clearer beta/manual-vs-auto handling.

## Code changes

### Investments
- Added `NIO` to the built-in instrument glossary.
- Tightened market-data lookup so explicit `NYSE`, `NASDAQ`, `LSE`, `AMEX` or `US` holdings do not fall back to provider-fund source pages.
- Added suspicious source/price guardrails for stock holdings whose source URL looks like a provider/fund factsheet.
- Quote search now begins automatically after 3 characters and always returns candidate/manual choices so users do not accidentally save a manual holding thinking it is tracked.
- Added a clear **Add manual instead** button.

### Pension / DB flows
- Reworked Add pension pot into a provider-aware two-step wizard with progress bar.
- Added provider capability metadata in the UI glossary.
- PensionBee defaults to value-first/pot tracking.
- NHS Pension is available as a defined-benefit provider.
- Defined Benefit flow now asks for scheme provider/type first and explains that it tracks service/pay/accrual, not units.

### Admin tiers and beta
- Added Admin → Beta tab.
- Added beta flags for site beta mode, manual upgrade review, future auto-approval for paid tier requests, and savings ladder beta.
- Fixed DB-side admin detection so `app_admin_tier_dashboard()` recognises the same admin row/email used by the app.
- Upgrade requests now create admin notifications routed to DB-backed admins.
- Plan requests can remain manual during beta or be auto-applied later if the paid/billing flow is enabled.

## SQL
Run:

```sql
db/v27_88_investment_ticker_tiers_beta_fix.sql
```

This creates/updates:

- `app_beta_flags`
- `investment_provider_capabilities`
- `app_is_platform_admin()`
- `app_platform_admin_user_ids()`
- `app_create_admin_notification(...)`
- `app_request_plan_change(...)`
- `app_admin_review_plan_request(...)`

## Notes
- Existing bad stock rows are not automatically overwritten. Open the holding and use **Check price** after this deploy; the refreshed quote should no longer use the provider-fund source.
- If you intentionally want a provider/OEIC fund such as a Vanguard LifeStrategy fund, leave it as asset type `fund` rather than `share`/`ETF`.
