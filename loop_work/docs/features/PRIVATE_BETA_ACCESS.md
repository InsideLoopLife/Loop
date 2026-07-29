# Private beta access

The private beta access gate hides the login/signup/reset flow behind a server-side code check.

## Why

The app can be deployed publicly while still preventing casual access to the login page.
The access code is not included in client-side JavaScript or rendered HTML, which reduces the chance that voucher-code extensions or crawlers scrape it.

## How it works

1. User lands on `/access`.
2. User enters access code.
3. Server action checks it against `LOOP_ACCESS_CODE_HASH` or `LOOP_ACCESS_CODE`.
4. On success, an HTTP-only cookie is set.
5. The user can then access `/login`.

## Recommended env

Use a hash and opaque cookie value in production:

```bash
LOOP_ACCESS_REQUIRED=true
LOOP_ACCESS_CODE_HASH=<sha256 CODE:SALT>
LOOP_ACCESS_CODE_SALT=loop
LOOP_ACCESS_COOKIE_VALUE=<random non-code secret>
```
