# v27.59 Household, Plan and Investment Polish

Run:

```sql
db/v27_59_household_plan_investment_polish.sql
```

Verify:

```sql
select * from public.app_v2759_healthcheck();
```

What changed:

- Account nav now removes the standalone Admin rights tab and adds a Plan tab.
- Household/admin permissions sit inside Households & sharing.
- Create household is hidden once a household exists and becomes a collapsed + create-another option.
- Account-level invite/recent invite duplicates are removed; invite/QR remains inside the active household page.
- Household member permission forms use a safer responsive grid to stop overlap.
- Investment market tier badge is clickable and explains Free/Plus/Pro investment access with an upgrade link.
- Plan comparison data is pulled from the tier database via app_get_plan_comparison().
