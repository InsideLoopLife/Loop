# UPDATE V28.07 — Property URL search + investment GBX value repair

## Property move search
- Added a visible **Property URL search** box above the moving-search form.
- The **Search & fill** button calls `/api/property/move-query/enrich` and fills the form fields before save.
- Keeps manual override: users can edit price, postcode, bedrooms, EPC, council tax and assumptions after lookup.
- Works with Rightmove/Zoopla/OnTheMarket-style listing URLs where the server can read listing text. If a site blocks scraping, the URL is still saved and the user can fill the figures manually.

## Investment value repair
- Fixed UK/London holdings where provider feeds return prices in GBX/pence but the UI treated them as pounds.
- Current UI totals now normalise LSE/XLON/GBX rows so values like `283p` are treated as `£2.83`, not `£283`.
- Historical chart fallback values use the same pence-to-pound correction.
- SnapTrade imports now normalise London/pence positions on import when the provider value clearly equals `units × pence price`.

## Why this matters
- The manual investment orientation still stores one user-entered price/value row.
- SnapTrade/provider positions can return native market prices; UK listed shares commonly arrive as pence. The UI now understands that distinction.
