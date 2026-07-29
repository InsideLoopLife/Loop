# LOOP v28.22.1 — HTML welcome email

This hotfix upgrades the welcome email from a plain/simple layout to a polished transactional HTML email.

## Included

- Responsive HTML welcome email in `lib/notifications/welcome.ts`.
- Feature cards for Savings, Mortgages, Investments and Property.
- Clear first-10-minutes onboarding section.
- Stronger CTA buttons linking to dashboard, household, mortgage, investments and integrations.
- Plain-text fallback kept for deliverability and accessibility.
- User name is HTML-escaped before rendering to avoid injection into the template.
- SQL template copy updated so Admin > Email formats has stronger matching wording.

## SQL

If you already ran v28.22, you can safely rerun:

```sql
db/v28_22_social_login_welcome_email.sql
```

It is idempotent and will update the welcome template copy.
