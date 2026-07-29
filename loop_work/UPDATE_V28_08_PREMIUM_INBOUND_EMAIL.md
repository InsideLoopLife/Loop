# v28.08 — Premium inbound email aliases

Adds the foundation for `alias@insideloop.life` imports without manual admin setup.

## What is included

- Premium-gated inbound alias tables.
- User self-serve alias claim page: `/account/inbound-email`.
- No per-user mailbox creation required. Use one catch-all inbound route for `*@insideloop.life`.
- Webhook endpoint: `POST /api/inbound/email`.
- Strict sender check: accepted mail must come from the user's verified account email.
- Safe parser for:
  - property URLs from Rightmove, Zoopla, OnTheMarket, PrimeLocation
  - stock tickers / exchange-style symbols / ISIN-like values
- All imports are staged in `loop_inbound_imports`; nothing is silently written into property or investment records.
- Unsupported URLs, wrong senders, inactive aliases and non-premium users are rejected and logged.

## Environment

Set this in production and local testing:

```bash
INBOUND_EMAIL_WEBHOOK_SECRET=long-random-secret
```

The webhook accepts either:

```txt
x-loop-inbound-secret: long-random-secret
```

or

```txt
Authorization: Bearer long-random-secret
```

## How automatic alias creation works

The email provider should be configured as a catch-all inbound parser for `*@insideloop.life` and forward all mail to `/api/inbound/email`.

The app does not need to create an inbox for each user. The user claims an alias in LOOP. When an email arrives, LOOP reads the local part before `@insideloop.life`, looks up that alias in the database, checks the sender and plan entitlement, then stages any safe imports.

## Still to wire

- Configure DNS MX records and inbound parse provider, e.g. Mailgun/Postmark/SendGrid/AWS SES.
- Point provider webhook to `/api/inbound/email` with the shared secret header.
- Add buttons on the review queue to convert a staged `property_url` into the existing property scraper flow.
- Add buttons on the review queue to convert a staged `investment_ticker` into the investment watch/analysis flow.
- Hook payment webhooks so a user gets/keeps entitlement automatically when their paid plan is active.
- Optional: add approved secondary sender emails per user.
