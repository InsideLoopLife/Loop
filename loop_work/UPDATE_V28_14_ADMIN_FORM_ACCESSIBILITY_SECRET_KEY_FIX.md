# UPDATE V28.14 — Admin form accessibility + Supabase admin-key detection

## What changed

### 1. Modal/form accessibility
- Replaced translucent modal panels with solid white panels so labels remain readable over dark backdrops.
- Strengthened input label contrast and placeholder contrast across the mortgage/house forms.
- Added helper copy to the **Add mortgage / rate** form so it is clearer what the balance, rate type, end date and payment override are used for.
- Added helper copy to the **Add valuation source** form so users/admins understand single valuation vs low/mid/high range.
- Added missing placeholders to mortgage/rate and valuation inputs.
- Updated the shared `FormInput` component so fields without explicit placeholders still get sensible defaults where appropriate.

### 2. House admin service-key handling
- Updated Supabase admin key detection to support both:
  - legacy service-role JWTs with `role = service_role`, and
  - newer Supabase `sb_secret_...` server-side keys.
- Rejects `sb_publishable_...` keys so a public key cannot accidentally be used for server-only admin work.
- Supports these server env names:
  - `SUPABASE_SECRET_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_SERVICE_KEY`
  - `SUPABASE_ADMIN_KEY`
  - `SUPABASE_SERVICE_ROLE`
- House admin no longer hard-stops the whole page when the key is missing/invalid. It shows a warning and renders in safe read mode where possible.
- House, Wealth Watch, Inbound Email and Investment Storage actions now give clearer key diagnostics.

## Why this matters

The earlier logic only accepted decodable JWT service-role keys. If the app was using Supabase's newer `sb_secret_...` key format, the code could wrongly report that the service key was missing even when a valid server secret was present.

## External action

Check Render/Vercel/local `.env` has one server-only key set, preferably:

```bash
SUPABASE_SECRET_KEY=sb_secret_...
```

or the legacy service role JWT:

```bash
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Do not expose this with `NEXT_PUBLIC_`.
