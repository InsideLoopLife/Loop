# LOOP Instant Boot V3 — full platform deep dive

## Why hard refresh was still slow

V2 made client navigation fast, but a hard refresh still entered the authenticated
server route and waited for the page's source-table queries/calculations before useful
HTML was available. Some routes currently assemble 10–20 datasets.

V3 adds a separate compact server presentation snapshot. It does not replace source
tables and never becomes the source of truth.

## Four-layer loading model

1. Browser/React state — instant same-session interaction.
2. V2 session route snapshot — warm navigation state.
3. V3 server boot snapshot — hard refresh / new tab first paint.
4. Live source data — authoritative route result, streamed/reconciled afterward.

Only a compact first-paint summary is persisted. The DB rejects payloads over 64KB.

## Routes covered by Instant Boot loading

- Financial briefing
- Dashboard
- Financial Flow
- Income
- Spending
- Savings / Accounts / Pots
- Investments & Pensions
- House / Mortgage
- Net Worth
- Retirement
- Nutrition
- Lifestyle

Existing V2 snapshots automatically publish compact V3 snapshots for Dashboard,
Income, Investments, House, Net Worth, Retirement and Nutrition.

Financial Flow, Spending, Savings, Briefing and Lifestyle publish exact compact
summaries from their already-computed fresh server state.

## Financial Flow visual update

The same workspace rail now connects:

Flow → Income → Spending → Savings & Pots

Income, Spending and Accounts now explicitly render that shared rail.
Accounts joins the FinancialFlowHouseShell and its internal tabs become a
horizontal snap/overflow rail rather than wrapping into stacked rows.

The existing Financial Flow duplicate local rail is removed so there is one clear
navigation system.

No charts, forms, server actions or financial calculations are removed.

## Security

Production Supabase now has `route_boot_snapshots` with:
- RLS
- auth.uid() ownership
- household-aware context key
- SELECT/INSERT/UPDATE only for authenticated users
- no direct anon access
- 64KB payload limit
- object-only payload
- SECURITY INVOKER RPCs

The Supabase security advisor was rerun after hardening. The new route-boot
functions no longer appear in the SECURITY DEFINER warnings; remaining warnings
are pre-existing functions elsewhere in the project.

## What remains authoritative

Snapshots are presentation only.

Authoritative calculations still come from the same existing routes, including:
- mortgage calculations and term logic
- affordability
- tax / NI / student loan
- maternity
- ISA allowance logic
- pension valuation / contributions
- savings accrual / interest
- investment pricing / FX / provider mapping
- household ownership / visibility
- recurrence and planned-item rules

## Expected UX after each route has been visited once

Hard refresh:

Nav → last complete compact view → “refreshing now” → fresh page

The first-ever visit to a route with no snapshot still uses the existing route-shaped
skeleton. After the first successful render, subsequent hard refreshes have a server
snapshot available.
