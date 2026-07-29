# LoopHealth product lookup and caching

LoopHealth should prefer reusable data over repeated AI/web checks.

## Lookup order

- User saved cards
- User ingredient/product database
- User private product cache
- Shared/global product cache
- Open Food Facts UK/global
- AI retailer/manufacturer research as a fallback

## UK source strategy

The search prioritises UK retailer/manufacturer sources where possible:

- Tesco
- Sainsbury's
- Asda
- Morrisons
- Waitrose
- Ocado
- Aldi
- Lidl
- Iceland
- UK brand/manufacturer websites
- Open Food Facts UK/UK-filtered queries

## Batch sources

For large data sources such as a drink brand, restaurant chain or supermarket range, use `/nutrition/batch`.

## Security note

The app does not expose API tokens to the browser. AI/web lookup happens server-side and is rate limited. The global shared cache is written with the Supabase service role only.
