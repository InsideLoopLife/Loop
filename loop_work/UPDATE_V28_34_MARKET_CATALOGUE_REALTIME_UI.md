# v28.34 Market catalogue realtime UI fix

- Expanded venue handling beyond the original UK/US/Vanguard set.
- Search can now look across global markets and has an optional venue-code field.
- European/OTC/Canadian/Asia-Pacific venue codes no longer get forced into GBX/LSE logic.
- Manual “Check price” now writes a minute snapshot, native price/currency, GBP equivalent, FX rate/source and previous-close movement.
- Investment page auto-refreshes while viewing investments so realtime users see minute changes without manually refreshing the page.
- Admin Investment Storage recent points now auto-refresh and shows native traded currency under GBP equivalent.
- Trading 212 imports are treated as unknown provider cost basis unless verified lots are imported, so daily P/L uses previous close rather than fake average buy prices.
- Added v28_34 SQL for market venue catalogue expansion and safe DB compatibility.
