# V27.2 household, auth and spending polish

## Household family tree
- Centred adult and child cards using flex wrapping so children stay centred instead of pinning left.
- Person cards now show uploaded/profile images whenever available, regardless of the account image-mode setting.
- Linked account avatars are pulled from `app_user_profiles` as a fallback when the `people.avatar_url` value is empty.
- Removed the redundant `verified` pill. A green tick remains the verification indicator for a linked/confirmed account.
- Moved role/tier/visibility flags into a right-side permission rail on each person card.
- Household image appears in the central household node as well as the header when available.

## Auth creation/reset fallback
- Password reset no longer hard-fails when `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` is not present.
- With an admin key, Loop still uses the branded 8 digit code flow.
- Without an admin key, reset falls back to Supabase's native recovery-link email and redirects through `/auth/callback` to `/account/update-password`.
- Account-page reset button uses the same fallback.
- Sign-up now falls back to Supabase native email/password sign-up if the admin key is not configured, instead of blocking account creation.
- Account header verification now shows `email verified` when Supabase reports the signed-in email as confirmed.

## Spending planner
- Replaced the single black plus/dropdown with clear add cards for Monthly, One-off, Child costs, Bank import and Categories.
- Each card opens the correct modal directly, reducing clicks and making the flow clearer on the page itself.

## Verification model
For now, the app treats a person profile as verified when it is linked to a Supabase user account, and the account header reflects Supabase email confirmation. Full identity/KYC verification is not part of this build.

## Checks run
- `npx tsc --noEmit` passed.
- `next build` compiled and TypeScript completed, but the hosted sandbox timed out during Next's page-data collection step.
