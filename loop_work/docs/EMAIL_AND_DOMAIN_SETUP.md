# insideloop.life email/domain setup

Recommended mailboxes/aliases:

- dan@insideloop.life — founder/main account
- notifications@insideloop.life — transactional email
- help@insideloop.life — general help
- cs@insideloop.life — customer service
- privacy@insideloop.life — privacy/GDPR/data requests

## DNS records

Your email provider will give you exact DNS values. Usually you need:

- MX records for receiving mail
- SPF TXT record
- DKIM TXT/CNAME record
- DMARC TXT record

Recommended DMARC starter:

```txt
v=DMARC1; p=none; rua=mailto:dan@insideloop.life
```

Once mail is stable, move towards:

```txt
v=DMARC1; p=quarantine; rua=mailto:dan@insideloop.life
```

Then eventually:

```txt
v=DMARC1; p=reject; rua=mailto:dan@insideloop.life
```

For beta, do not use a personal Gmail as the from-address for app emails. Use `notifications@insideloop.life`.
