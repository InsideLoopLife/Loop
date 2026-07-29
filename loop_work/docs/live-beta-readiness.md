# What is left before going live

## Good for password-protected beta after integration

This package is suitable for a password-protected beta once mounted and tested, assuming the rest of LOOP has secure auth and user/household isolation.

## Still needed before wider public release

1. Stripe integration
   - Checkout session creation
   - Webhook signature verification
   - Subscription created/updated/deleted sync
   - Failed payment and retry handling
   - Downgrade/cancellation behaviour

2. Real authentication integration
   - Replace `x-loop-user-id` fallback in `userEntitlements.js` with your real Supabase session/user middleware.
   - Ensure users can only check entitlements for themselves.

3. Household isolation tests
   - Attempt cross-household reads/writes using guessed IDs.
   - Confirm all household/profile/child/wealth data is scoped.

4. Data compliance
   - Privacy policy
   - Terms
   - Health/wealth disclaimers
   - Export-my-data
   - Delete-my-data
   - Consent capture for health insights

5. Observability
   - Error logging
   - Admin audit log viewer
   - AI spend caps
   - Daily DB backups
   - Rollback process

6. Security hardening
   - CSRF protection for cookie-auth writes if needed
   - Secure/SameSite cookies
   - Rate limits on AI and auth endpoints
   - No sensitive request bodies in logs
   - Environment variable review
