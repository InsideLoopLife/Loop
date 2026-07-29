# v27.5 Affordability + investments patch

Run `db/v27_5_affordability_investments_price_history.sql` before deploying this build.

## Affordability lab
- Adds `/affordability-lab` and a nav item labelled `Can I afford?`.
- The page is a Google-style conversational mockup with rotating examples.
- It can use the saved OpenAI token to interpret natural-language prompts, ask missing questions and draft a scenario log.
- Existing affordability scenarios remain available under `/affordability`.

## Investments
- Investment pots now have an edit modal, including owner/person assignment.
- Investment pot cards have a clearer header, showing value, gain/loss, fees, owner and pot controls.
- Add holding now starts with a single search bar. Search accepts company names, tickers, ETFs and common Vanguard funds.
- Funds/ETFs can be saved as holdings with `asset_kind`, ISIN/fund code, OCF/asset fee and price polling toggle.
- Adds `/api/cron/investment-price-snapshots`, protected by `CRON_SECRET` or `INVESTMENT_CRON_SECRET`, for 15-minute price history checks.

## Cron suggestion
Call this every 15 minutes:

`GET /api/cron/investment-price-snapshots`

with header:

`Authorization: Bearer <CRON_SECRET>`

The route skips weekends and rough non-market hours. A later patch can add a full exchange holiday calendar if you want precise UK/US bank-holiday handling.
