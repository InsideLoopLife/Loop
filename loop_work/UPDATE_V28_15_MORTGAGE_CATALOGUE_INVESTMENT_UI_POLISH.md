# UPDATE V28.15 — Mortgage catalogue, user mortgage deals and investment UI polish

## Mortgage catalogue admin

- Removed the repeated `ai source catalogue` pill from catalogue rows. This is now treated as an internal ingestion method rather than a visible admin badge.
- Kept the rate large on the right-hand side.
- Added clearer pills beneath the rate for:
  - term / type, for example `2 year`, `5 year`, `SVR / variable`, `Tracker / variable`
  - product fee
  - LTV band / LTV check
- Term pills use pastel colours so admin can scan products quickly.

## User mortgage deals

- The user mortgage-deals panel now has a fallback view for published active mortgage catalogue rows, even before a personalised renewal recommendation has been generated.
- Once Mortgage Watch creates user-specific recommendations, personalised cards still take priority.
- The empty state now explains the actual operational path: publish reviewed catalogue rows, then run Mortgage Watch.
- The top “Deals available” count now uses personalised recommendations first, then published market catalogue rows if no personalised recommendations exist.

## Investments

- Removed visible provider-sync text from holding cards.
- Removed visible annual asset fee text from holding cards; fees remain available through information/settings surfaces instead of cluttering the card.
- Removed the top-level account fee stat tile from the pot header.
- Removed `SnapTrade · true/connected` style wording from the pot subtitle.
- Unknown market status no longer says `quote source`; it now falls back to `closed` with the grey status treatment.
- Imported Trading 212/SnapTrade positions are bundled by default when there are many imported positions and no provider pie metadata is available.
- New SnapTrade imports for Trading 212 now store a default group label so the bundled view survives refreshes and future imports.

## Integrations

- Removed the user-facing OpenAI token form from `/integrations`.
- Removed the user-facing saved API token list from `/integrations`.
- Updated page copy to make clear that platform/API secrets should live server-side in environment variables or a managed secret store.

## SQL

No new SQL migration is required for this update.
