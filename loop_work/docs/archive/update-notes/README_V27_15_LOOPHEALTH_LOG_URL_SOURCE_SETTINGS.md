# V27.15 – LoopHealth log URL import, source details and health settings

## Included

- Saved recipe/product cards now show a clear **Source details** block when available:
  - Menu estimate badge
  - Restaurant/source name
  - Menu price
  - Source URL link
  - Confidence note
  - Allergen flags separated from dietary flags

- Log food flow now has a fallback when product search returns nothing:
  - Paste a restaurant/bakery/product URL
  - LoopHealth scans it using the menu import route
  - Import status is written to app notifications where possible
  - Imported menu results can be selected for immediate logging
  - Imported results can also be bulk-saved into reusable meal/product cards

- Profile avatars in the **Who ate this?** selector now fall back to linked account avatars from `app_user_profiles`.
  - The lookup is server-side only.
  - It only resolves avatars for already-linked household people.
  - If a Supabase admin key is available, it uses that server-side to avoid RLS gaps without exposing the key to the browser.

- Food log is now full-width and grouped by meal slot.

- Saved meal cards are moved into their own tab.

- Adult/child scaling and Apple Health/integration placeholders are moved into **Health settings**.

## Migration

Run:

```sql
db/v27_15_loophealth_log_url_source_settings.sql
```
