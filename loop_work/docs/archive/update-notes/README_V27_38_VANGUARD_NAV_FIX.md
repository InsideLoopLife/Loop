# V27.38 Vanguard LifeStrategy NAV fix

Fixes Vanguard LifeStrategy 80 Accumulation being treated as an LSE/GBX stock quote.

- Matches `GB00B4PQW151`, `VGLS80A`, `LifeStrategy 80 Acc`, and existing text tickers to the provider fund candidate.
- Treats the holding as a Vanguard/provider fund with GBP NAV pricing.
- Adds source parsing fallbacks for Vanguard, Fidelity, HL and FT pages.
- Rejects obviously wrong tiny prices for this share class, such as pence-style values being treated as the fund NAV.
- Adds a migration to repair existing incorrectly saved holdings and the provider glossary price.
