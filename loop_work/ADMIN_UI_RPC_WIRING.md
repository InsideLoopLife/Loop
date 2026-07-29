# Admin UI RPC wiring

Use these Supabase RPC calls in admin server components/actions.

```ts
const { data: snapshot } = await supabase.rpc("loop_admin_dashboard_snapshot");
const { data: users } = await supabase.rpc("loop_admin_users_list", { p_limit: 100 });
const { data: products } = await supabase.rpc("loop_admin_products_list", { p_limit: 100 });
const { data: imports } = await supabase.rpc("loop_admin_product_imports_list", { p_limit: 100 });
const { data: nav } = await supabase.rpc("loop_admin_navigation");
```

`loop_admin_dashboard_snapshot()` returns JSON with:

```txt
counts.auth_users
counts.admin_users
counts.profiles
counts.households
counts.products
counts.product_quality_rows
counts.product_import_batches
counts.open_alerts
counts.open_user_issues
counts.money_deals
counts.properties
counts.vehicles
sections[]
database{}
```

If the UI is still showing static/fake cards after this SQL passes, it needs a code update to read these RPCs.
