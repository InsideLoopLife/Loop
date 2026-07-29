# Life Tracker V23.1 Loop Navigation Patch

This patch keeps the V23 LoopWealth/LoopHealth structure and updates the header navigation:

- LoopWealth and LoopHealth are now mode toggles rather than simultaneous nav groups.
- The right-side toggle switches between the Wealth nav and Health nav.
- Account, Notifications and Sign out remain inside a fixed account dropdown.
- The desktop header uses 95vw width for more usable navigation space.

# Life Tracker Workable V5

Private Next.js + Supabase life/finance tracker.

## V5 changes

- Household is now clean and only for adding/opening people.
- Person profile is the place to manage salary, NHS maternity pay and child-specific costs.
- Spending now has the nuanced child-cost builder too, so bills/child outgoings can be planned from the spending area as well.
- NHS maternity pay has simple and advanced modes:
  - Simple: annual salary, maternity start/end, split equally or actual week-by-week.
  - Advanced: override full-pay weeks, half-pay + SMP weeks, SMP-only weeks, unpaid weeks and SMP weekly rate.
- Dashboard month calendar now uses maternity pay month-by-month instead of treating it like a flat salary.
- Integrations now has a local-development OpenAI token area for mortgage-rate research/summaries.
- Production build tested with dummy Supabase env vars.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_your_key_here
```

3. Run the latest migration in Supabase SQL Editor:

```txt
db/v5_schema.sql
```

If you are starting from scratch, run:

```txt
db/schema.sql
```

4. Restart local dev:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

## How to use the main sections

### Household

Use this only to add people and open profiles.

- Adults/parents are warm highlighted.
- Children are soft blue with opacity.
- Click a person to manage the detail.

### Person profile

For adults/parents:

- Add salary events.
- Add NHS maternity events.
- Add return-to-work or salary-change events.
- Use monthly override if you have a known payslip amount.

For children:

- Add nursery, wraparound, fixed child costs and activities.
- Simple mode is quick planning.
- Advanced mode exposes funded hours, hourly credits and exact hours.

### Spending

Use this for all outgoings:

- Fixed bills.
- Variable budgets.
- Child costs like nursery, clubs, swimming or dancing.
- Logged real spending.

### Dashboard

Use this as the month-by-month view:

- Click a month in the calendar.
- It lists income and outgoings behind that month.
- NHS maternity pay is calculated for that month using the maternity event settings.

### Integrations

Use this to track planned integrations and, for local development, save an OpenAI token for mortgage-rate research.

Important: the OpenAI token section is for local/private development. Before deploying publicly, move secrets to a proper vault or managed secret store.

## Build check

This version was checked with:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_dummy npm run build
```

The build completed successfully.

## V7 update

Run this after V6 if you are upgrading an existing Supabase project:

```sql
-- paste the contents of db/v7_schema.sql into Supabase SQL Editor and run it
```

V7 adds:

- Pension method support on pay events: net pay, NHS pension, salary sacrifice, relief at source or none.
- Homes, household ownership and mortgage deals attached to homes.
- Dashboard mortgage outgoings from active mortgage deals when present.
- Statutory rate assumptions for SMP/tax/student-loan/stamp-duty audit trails.
- Wider integration categories for Open Banking, Open Finance, statutory rates and AI research.

The OpenAI key stored under Integrations is only intended for local/server-side research helpers. It is not an Open Banking connection and must not be exposed to browser code.

## V8 update — spending planner calendar

Run this migration after V7:

```sql
-- Supabase SQL Editor
-- paste and run db/v8_schema.sql
```

V8 adds:

- Person-linked planned items for the Spending Planner.
- A black top-right `+` menu on Spending Planner.
- Add monthly cost/income items such as Spotify, Shopify, Netflix, child benefit, etc.
- Add one-off spending entries.
- Assign costs/income to any household member or to the whole household.
- Calendar view with monthly income/outgoing totals.
- Modal on desktop and bottom-sheet style modal on mobile.
- Overview now also pulls planned items into monthly income/outgoing totals.

After running the migration, restart locally:

```bash
npm run dev
```

## V9 migration

If you are updating from V8, run this in Supabase SQL Editor:

```txt
db/v9_schema.sql
```

V9 adds editable mortgage records, map/location fields on homes, low/mid/high valuation assumptions, valuation-source records, and a move planner that estimates equity, stamp duty, new mortgage size, LTV band and monthly payment.

## V10 update - property lookup, map-led home tracking and affordability score

Run this migration after V9:

```bash
# Supabase SQL Editor
# paste and run db/v10_schema.sql
```

### What changed

- Mortgage page now starts with a focused **Tracked home** map panel.
- Add/edit home is simplified around **house number/name + postcode** first.
- The lookup route fills postcode geocode/location data using a server route at `/api/property/address-lookup`.
- The app now stores address lookup metadata: house number, lookup source, UPRN/provider ID, property type, purchase source URL and lookup date.
- Low/mid/high valuations can be entered directly as manual overrides.
- Separate valuation sources still feed a confidence-weighted average when no manual override is present.
- Affordability score now compares the future mortgage payment against the current month tracked income/outgoings.

### Current lookup behaviour

The V10 lookup fills useful map/location fields now, but exact historic purchase price/date still needs either:

1. manual entry,
2. a saved HM Land Registry source/search link,
3. a later imported Land Registry dataset, or
4. a commercial property data provider such as PropertyData.

This is deliberate: it avoids pretending we have reliable live purchase-price/valuation data before the right source is configured.

## V11 notes

Run this migration after V10:

```bash
# Supabase SQL Editor
 db/v11_schema.sql
```

V11 adds:

- `/assumptions` page for SMP, tax, NI, student loan, stamp duty and mortgage stress-rate assumptions.
- Baseline assumption seeding on first dashboard load for each user.
- An assumption check log.
- Server route scaffold: `POST /api/assumptions/check`.
- Pay-event assumption checks when salary/maternity/student-loan/pension-sensitive details are added or edited.
- Updated 2026/27 student-loan thresholds in the local tax calculator.

For banking/investments, the app remains manual/CSV-first. True automated bank/investment connections need an Open Banking/Open Finance provider and a proper consent flow.


## V12 mortgage balance projection

Run `db/v12_schema.sql` after V11. Mortgage records now store:

- opening / last-known balance
- balance date
- repayment type: repayment or interest-only
- monthly payment override if you want to use the real direct debit

The Mortgage page estimates today's outstanding balance by rolling the mortgage forward month by month from the balance date using the interest rate and payment. This feeds the tracked-home LTV, move-planner equity and total mortgage balance cards.

This is a planning estimate. If your lender changes payments, applies fees, makes ad-hoc overpayments, or recalculates interest daily rather than monthly, update the balance/date periodically from the mortgage statement.

## V13.1 banking CSV import

Run `db/v13_schema.sql` in Supabase before using the banking import.

The Spending Planner now has a black `+` menu option called **Import bank CSV**. Upload a bank export CSV with common columns such as Date, Description/Details and Amount, or Money In/Money Out. The import stores the raw transactions privately, groups similar descriptions, and creates recurring-payment suggestions when a payment appears across multiple months.

Accepted suggestions become normal monthly planner items. Use the **No end date** checkbox for costs that continue until you manually stop them.

This is intentionally manual/CSV first, because it gives useful outgoing detection without requiring Open Banking provider approval or storing bank credentials. Later, the same transaction tables can be fed by TrueLayer, GoCardless Bank Account Data, Plaid, Moneyhub or another Open Banking/Open Finance provider.


## V13.1 note

This version includes a safety patch in `db/v13_schema.sql` so the migration also creates the `planned_items` table if the earlier V8 migration was not present in your Supabase project.

## V14 changes

Run `db/v14_schema.sql` after V13.1.

V14 adds:
- Tax-Free Childcare support on nursery costs, including 20% top-up offset and quarterly cap planning.
- Person assignment on income entries.
- Net worth page now pulls property values and projected mortgage balances automatically, split by home ownership.
- Net worth add asset/liability is now via top-right modal buttons.
- Mortgage page has a punchier mortgage-card layout, clearer valuation cards and an AI-ready rate research modal.
- Mortgage term helper checks adult household birth dates and gives an age-75 planning guide.
- Affordability page wording now behaves more like a saved search/answer box.

The rate-research endpoint is `POST /api/mortgage/rate-research`. It uses a saved OpenAI token from Integrations when present and otherwise returns fallback planning assumptions. Always verify rates, product fees and eligibility against lender/broker sources before relying on them.

## V15 visual polish

This version focuses on the app experience rather than database changes:

- Softer finance-app background and card system
- Sticky glass navigation with icons and active states
- More premium stat cards and section cards
- Updated form inputs, buttons and modal surfaces
- Better default styling across Dashboard, Mortgage, Spending, Income, Net Worth and Household without changing the data model

No new SQL migration is required if you are already on V14/V14.1.

## V17 - Pensions & Investments

Run `db/v17_schema.sql` after the earlier migrations to enable the new pensions/investments area.

New page: `/investments`

What it supports:
- Pension accounts grouped by label/provider, e.g. `Company pension · Legal & General` or `Private pension · PensionBee`.
- Pension funds/pots under each pension account with current value, unit/price, monthly contribution allocation %, target allocation %, and fee assumptions.
- Work/private pension setting and contribution method: salary sacrifice, net pay, relief at source, or none.
- Employer contribution % and employer NI top-up % assumptions.
- Investment accounts grouped by label/provider, e.g. `Investment · GIA · Revolut`, `Investment · GIA · Trading 212`, `Investment · ISA · Trading 212`.
- Investment holdings with ticker, exchange, units, average buy price, latest price, current market value and gain/loss.
- Net worth now automatically pulls pension and investment account values.

For market prices, start manually. Later you can save a market-data token in Integrations using provider `alpha_vantage`, `financial_modeling_prep`, or `fmp`, then wire the `/api/investments/quote-check` route into the UI for quote lookups.

## V18 additions

Run `db/v18_schema.sql` after V17/V14 migrations to add:

- Pension fund AI research notes
- Lifestyle bill/deal tracking
- Grocery supermarkets
- Meal planning and rough macro/micro tracking

New page: `/lifestyle`.

The OpenAI token is used server-side only for fund fee / fund option research. If no token is saved, the app shows a fallback checklist instead of blocking the workflow.

---

## V20 responsive web baseline

This package is intended as the desktop/mobile web baseline. Keep this version for testing the current browser dashboard while the separate PWA package is used for iPhone-style testing.

## V20.1 security note

Before saving any API token in Integrations, add an app encryption key to `.env.local`:

```bash
openssl rand -base64 32
```

Then paste the generated value into:

```env
APP_ENCRYPTION_KEY=your_generated_value
```

If you are upgrading from an earlier build, run:

```txt
db/v20_security_schema.sql
```

Then delete and re-save any existing OpenAI/market-data tokens so they are stored encrypted rather than in the old legacy plaintext column.

## V21 platform refactor

This version adds the first proper platform-hardening layer before moving the app online:

- `/platform` readiness page
- household tenancy scaffold
- privacy-preserving audit logs
- export-job requests
- platform notes
- formal migration copy under `supabase/migrations`
- production/security documentation under `docs/`

### Required V21 migration

Run this in Supabase SQL Editor:

```txt
db/v21_platform_schema.sql
```

Then open:

```txt
/platform
```

and press **Initialise household** once.

### Recommended env additions

```env
APP_SIGNUP_MODE=closed
NEXT_PUBLIC_APP_SIGNUP_MODE=closed
```

Keep `APP_ENCRYPTION_KEY`, `SUPABASE_SECRET_KEY` and `CRON_SECRET` server-only.

## V22 account/admin/notification setup

Run this migration after V21:

```txt
db/v22_account_admin_schema.sql
```

Then set these environment variables before testing admin/email flows:

```env
APP_BASE_URL=http://localhost:3000
APP_CREATOR_EMAILS=your@email.com
RESEND_API_KEY=
EMAIL_FROM="Life Tracker <updates@yourdomain.com>"
CRON_SECRET=generate_a_long_random_value
```

Open:

```txt
/account
/notifications
/admin
```

For production, configure Supabase Auth redirect URLs for password reset and recovery links, then use invitation-only access.

## V23 cleanup notes

Run `db/v23_schema.sql` after V22 to add the LoopWealth/LoopHealth IA changes, pension NI top-up flag and higher-precision investment holding fields.

V23 keeps admin/platform/integration links out of normal navigation. Creator-only links are surfaced from Account when `APP_CREATOR_EMAILS` or `app_admin_users` grants access.

## V23.4 investment-pot update
- Main investment actions now create the pot wrapper first: `Add pension pot` or `Add investment pot`.
- Funds, holdings, pies and bulk imports are added inside their relevant pot.
- Stock/fund holding entry starts with ticker/exchange search and supports delayed/end-of-day quote fallback where available.
- Purchase lots can be entered per holding; the app totals units and calculates weighted average price.
- Run `db/v23_4_schema.sql` after V23.3 to add purchase-lot tracking.

## V23.5 investment provider glossary and ticker search

This version adds a provider glossary for pension/investment pot setup and a smoother ticker-first holding workflow.

Run after installing:

```sql
-- Supabase SQL editor
-- db/v23_5_schema.sql
```

Highlights:
- Add pension pot / add investment pot now start from provider and allowed account offerings.
- Trading 212, Revolut, L&G, PensionBee, Vanguard, HL, AJ Bell, Fidelity, ii, InvestEngine and Moneybox are seeded as a starting glossary.
- Provider docs/source URLs are stored so a future daily checker can flag fee/T&C changes before anything is auto-updated.
- Holding search can work from ticker alone, trying UK/LSE delayed/EOD lookup first where no exchange is supplied.
- If a quote is not found, the app now returns a selectable manual candidate rather than blocking the flow.
