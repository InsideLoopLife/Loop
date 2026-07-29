# v27.94 SnapTrade / Tier Dashboard Hotfix

This fixes the Admin > Tiers error:

`function digest(text, unknown) does not exist`

The failing path was the tier dashboard RPC calling an older `app_admin_list_users_by_tier` function that used `digest()` without the correct schema/search path. The hotfix recreates that RPC using `md5()` for the non-sensitive anonymous display reference, avoiding the pgcrypto/search-path issue entirely.

It also separates two concepts in investment tiering:

- **Can connect a paid provider** — tier/status allows the user to open SnapTrade.
- **Can use realtime prices** — SnapTrade/provider is already connected and healthy.

Previously the connect button waited for the provider to already be live, which made SnapTrade a chicken-and-egg flow. Users could not connect because they were not already connected.

Run:

```sql
db/v27_94_snaptrade_tier_dashboard_hotfix.sql
```

Then restart the Next dev server and refresh `/admin/tiers` and `/investments`.
