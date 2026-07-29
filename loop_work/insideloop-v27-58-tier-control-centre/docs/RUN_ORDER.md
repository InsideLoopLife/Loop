# v27.58 Run Order

1. Run SQL:

```sql
-- db/v27_58_tier_control_centre.sql
```

2. Verify:

```sql
select * from public.app_v2758_healthcheck();
```

All rows should return `ok = true`.

3. Restart localhost:

```bash
npm run dev
```

4. Visit:

```txt
/account/plan
```

as a normal user.

5. Visit:

```txt
/admin/tier-control
```

as Dan/admin.

6. Add `Plan` to the far right of your account nav and add `Tier Control Centre` only for admin users.

An example component is included:

```txt
components/account/AccountNav.v27_58.example.tsx
```

## Important

No payment gateway is used yet. Upgrade requests are logged for testing. Admins can manually override users onto Free/Plus/Pro/Staff.
