# LOOP v28.09 — Email-to-LOOP security hardening + setup instructions

This update hardens the premium inbound email feature from v28.08 and adds the missing user-side approval action.

## What changed in this build

- Webhook secret check now uses a dedicated `INBOUND_EMAIL_WEBHOOK_SECRET` only, not the cron secret.
- Secret comparison uses constant-time comparison.
- Webhook rejects oversized messages before parsing.
- Webhook rejects attachments for MVP.
- Webhook only accepts the configured inbound domain, default `insideloop.life`.
- Webhook rejects invalid aliases before touching user records.
- Webhook has per-alias and per-sender hourly rate limits.
- Provider message IDs are idempotent so retries do not duplicate imports.
- Ticker parsing is stricter and no longer treats normal capitalised words from property emails as tickers.
- User approval button added on `/account/inbound-email`.
- Property URL approvals create a `property_move_queries` record using the existing listing ingestion logic.
- Investment ticker approvals move the item to `ready` rather than creating fake holdings with unknown units.
- Added database indexes and RLS update policy for the user's own staged imports only.

## Manual setup required outside the codebase

### 1. Choose an inbound email provider

Recommended options:

- Postmark inbound
- Mailgun routes
- SendGrid Inbound Parse
- AWS SES inbound + Lambda/API forwarding

For the MVP, Postmark or Mailgun is easiest.

### 2. Add DNS for `insideloop.life`

In your DNS provider, add the MX records required by the inbound provider. The exact MX values come from the provider dashboard.

Also add SPF/DKIM/DMARC records if the provider asks for them. Even though LOOP is receiving mail, these help provider validation and reduce spoofing confusion.

### 3. Configure one catch-all inbound route

Create one route for:

```text
*@insideloop.life
```

Point it to:

```text
https://YOUR-APP-DOMAIN.com/api/inbound/email
```

Do not create a mailbox per user. The app extracts the left-hand alias from the recipient address and maps it to `loop_inbound_aliases`.

### 4. Add webhook secret

Create a long random secret. Minimum 24 characters; ideally 48+.

Add this environment variable to Vercel/Render/local `.env`:

```text
INBOUND_EMAIL_WEBHOOK_SECRET=your-long-random-secret
INBOUND_EMAIL_DOMAIN=insideloop.life
INBOUND_EMAIL_MAX_BYTES=128000
INBOUND_EMAIL_MAX_PER_ALIAS_HOUR=30
INBOUND_EMAIL_MAX_PER_SENDER_HOUR=60
```

Then configure the provider to send one of these with every webhook request:

```text
x-loop-inbound-secret: your-long-random-secret
```

or:

```text
Authorization: Bearer your-long-random-secret
```

Do not reuse `CRON_SECRET` for inbound mail.

### 5. Run SQL migrations

Run these in order if not already run:

```sql
-- v28.08
\i db/v28_08_inbound_email_premium.sql

-- v28.09
\i db/v28_09_inbound_email_hardening.sql
```

If using Supabase dashboard, paste and run the contents of both files.

### 6. Deploy the app

Deploy the v28.09 build, then test:

1. Sign in as a premium user.
2. Open `/account/inbound-email`.
3. Claim an alias, for example `danmunstar`.
4. Send an email from the verified login email to `danmunstar@insideloop.life`.
5. Include a Rightmove/Zoopla/OnTheMarket URL or explicit ticker lines like:

```text
TICKER: G4M.L
$AAPL
WATCH: VWRP.L
```

6. Confirm the item appears in Review imports.
7. Approve it.

## Security model

The webhook never trusts the email address alone. An import only gets staged if all checks pass:

1. Correct webhook secret.
2. Payload size under limit.
3. Recipient domain equals `insideloop.life`.
4. Alias exists and is active.
5. Sender exactly matches the verified login email stored for that alias.
6. User has premium entitlement.
7. No attachments.
8. Content is only an allowlisted property URL or explicit ticker.
9. Item goes into review queue first.
10. User can only update/reject/import their own rows through RLS and `user_id` filters.

## Remaining future improvements

- Add optional extra approved sender emails after verifying them by confirmation link.
- Add an admin screen for inbound email health: accepted/rejected counts, top rejection reasons, rate-limit events.
- Add provider-specific signature verification if your chosen provider supports it.
- Add automatic user notification when an inbound import is staged.
- Add a direct investment screen consumer for `loop_inbound_imports.status = 'ready'` tickers.
