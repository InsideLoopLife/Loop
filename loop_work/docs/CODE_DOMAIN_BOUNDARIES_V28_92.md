# LOOP v28.92 code-domain boundaries

This release separates code responsibilities before any database schema move.
Existing URLs, tables, RLS policies and data remain unchanged.

## Product domains

- `domains/identity`: signed-in user, household context, entitlements, profile and sharing contracts.
- `domains/wealth`: Financial Flow, investments/pensions and House entry points.
- `domains/health`: nutrition and lifestyle entry points, private-by-default access boundary.
- `domains/market`: shared, non-user-specific price data repositories.
- `platform`: database clients, permissions, workers, audit and infrastructure concerns.
- `shared`: UI and types that are safe for every domain.

## Database clients

- User pages use `platform/database/server-client` or `browser-client`; RLS applies.
- Privileged work uses `admin-client` only on the server.
- Scheduled jobs use `worker-client` with a named purpose (`market`, `rates`, `health`, etc.).
- The named worker purpose is currently a code boundary. Database-specific worker credentials come in the later DB phase.

## Route adapters

The following URLs are unchanged but now delegate to domain modules:

- `/account` → `domains/identity/account`
- `/financial-flow` → `domains/wealth/financial-flow`
- `/investments` → `domains/wealth/investments`
- `/mortgage` → `domains/wealth/house`
- `/nutrition` → `domains/health/nutrition`
- `/lifestyle` → `domains/health/lifestyle`

## Compatibility adapters

Old imports from `lib/supabase`, `lib/auth/household-context` and
`lib/features/user-feature-access` remain valid. They re-export the new domain
or platform implementation so the codebase can migrate incrementally.

## Security position

Folder separation is not the security boundary. RLS and server-side checks
remain authoritative. This release centralises those checks so the later schema
and credential split can be introduced without a simultaneous UI rewrite.

Health resource access is declared private-by-default in the new resource guard.
Current legacy household-aware health queries are preserved for compatibility
and must move to explicit sharing permissions in the DB phase.

## Validation

Run:

```bash
npm run check:boundaries
npm run typecheck
```

The boundary check blocks direct Health → Wealth imports, privileged clients in
Health UI code, privileged clients in browser components and user-sensitive
dependencies inside shared Market modules.
