# V27.12 — LoopHealth product data security/scale hardening

This patch hardens the barcode/product lookup flow before scaling beyond a private household beta.

## What changed

- Added a shared product cache: `nutrition_global_product_catalog`.
- Kept personal corrections in `nutrition_product_catalog`.
- Added a server-side rate-limit ledger: `app_rate_limits` + `consume_app_rate_limit` RPC.
- Product lookup now checks: private cache → shared cache → Open Food Facts → optional AI retailer search.
- AI retailer research only runs when the user presses **Retailer search**, rather than silently running on every weak match.
- Recipe estimate and product lookup endpoints now have per-user rate limits and request-size limits.
- External URLs are restricted to HTTPS/public hosts.
- Cached raw product payloads are compacted so the database is not filled with large third-party JSON blobs.

## Deploy

Run:

```sql
\i db/v27_12_loophealth_product_security_scale.sql
```

Make sure the server has:

- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` for global cache/rate-limit RPC writes.
- `APP_ENCRYPTION_KEY` for encrypted user OpenAI tokens.
- `APP_SIGNUP_MODE=invite` or `closed` until you add public-facing abuse controls.

## Notes

Open Food Facts should remain the first external data source. GS1 can help verify barcode/product identity but should not be treated as a complete nutrition database. Retailer/manufacturer research is useful for UK coverage but must be cached, rate-limited and presented as evidence/confidence rather than truth.
