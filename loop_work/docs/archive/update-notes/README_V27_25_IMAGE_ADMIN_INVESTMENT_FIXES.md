# V27.25 – image, admin setup and investment fixes

## Fixes

- Image extraction for recipe/menu pages now handles:
  - Open Graph/Twitter image meta tags
  - lazy-loaded image attributes
  - `srcset` / responsive image values
  - protocol-relative and relative image URLs
  - broken/invalid partial URLs such as query-string-only image values.

- Nutrition cards and food-log thumbnails now fall back gracefully if an external image URL fails to load.

- Admin setup now accepts both:
  - `SUPABASE_SECRET_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_SERVICE_KEY`

- If no service-role key is configured, `/admin/setup` now falls back to a normal Supabase password-reset email for the allowed admin email. This cannot create the account, but it avoids a hard block when the account already exists.

- Investment holding add/update now handles older databases that do not yet have `asset_kind` by retrying without the field.

## Migration

Run:

```sql
db/v27_25_image_admin_investment_fixes.sql
```

This adds `asset_kind` and related investment holding columns idempotently.
