# UPDATE V28.10 — LOOP Inbox Postmark Admin Checklist

## What changed

This update turns Email-to-LOOP into a clearer premium product setup flow and adds a developer-centric admin checklist.

### Added

- New admin page: `/admin/future-integrations`
- New admin navigation tab: **Future integrations**
- LOOP Inbox product architecture summary
- Postmark startup setup checklist with persistent check-off state
- Completed items are removed from the active list and kept in a completed audit section
- Environment readiness display for inbound email secrets
- Direct link to `/account/inbound-email`
- New SQL migration: `db/v28_10_loop_inbox_postmark_admin_checklist.sql`

### Hardened / improved

- Default inbound domain changed to `inbox.insideloop.life`
- Alias claim RPC now creates aliases on `inbox.insideloop.life`
- Existing aliases on `insideloop.life` are migrated to the safer subdomain
- Inbound API supports Postmark JSON fields:
  - `FromFull.Email`
  - `ToFull[]`
  - `OriginalRecipient`
  - `TextBody`
  - `HtmlBody`
  - `MessageID`
  - `Attachments`
  - `Headers`
- Inbound API supports Basic Auth, header secret, bearer secret or query secret
- Postmark authentication headers are captured into the audit event
- Explicit SPF/DKIM/DMARC failures are rejected when present

## Recommended provider

Use Postmark first.

Reason:
- cheapest realistic startup path
- simple inbound JSON webhook
- free Developer tier for testing
- no per-user mailbox creation
- easier than AWS SES for MVP

## Required setup

Run SQL in this order:

1. `db/v28_08_inbound_email_premium.sql`
2. `db/v28_09_inbound_email_hardening.sql`
3. `db/v28_10_loop_inbox_postmark_admin_checklist.sql`

Render environment variables:

```bash
INBOUND_EMAIL_DOMAIN=inbox.insideloop.life
INBOUND_EMAIL_WEBHOOK_SECRET=<long generated secret>
INBOUND_EMAIL_BASIC_USER=loop
INBOUND_EMAIL_BASIC_PASSWORD=<long generated password>
SUPABASE_SECRET_KEY=<service role key>
```

Postmark webhook:

```text
https://loop:<INBOUND_EMAIL_BASIC_PASSWORD>@YOUR_APP_DOMAIN/api/inbound/email
```

Microsoft / DNS:

- Keep Microsoft 365 MX records for the root domain if you use normal email there.
- Add Postmark MX records only for `inbox.insideloop.life`.
- Do not point the root `insideloop.life` MX away from Microsoft unless you want to move normal email too.

## Security position

The feature remains staged and zero-trust:

- Premium entitlement required to claim alias
- Premium entitlement checked again on every inbound email
- Sender must exactly match the verified account email
- Attachments rejected for MVP
- Payload size limited
- Duplicate MessageID protected
- Rate-limited per alias and per sender
- Unsupported URLs rejected
- Property and investment records are not mutated until user approval
- RLS ensures users can only read/update their own staged imports
