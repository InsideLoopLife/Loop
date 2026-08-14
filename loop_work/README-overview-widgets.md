# Overview page — drag & drop widget grid

## What's done
- Migration applied directly to Supabase (project vuqlgderfszguttdnxsr): `user_dashboard_widgets` table, RLS policy scoping rows to `auth.uid() = user_id`, updated_at trigger using your existing `app_set_updated_at()`.
- `lib/dashboard/types.ts` — the widget contract (`WidgetProps` in, JSX out).
- `lib/dashboard/widget-registry.tsx` — single source of truth for what widget types exist, their default/min size, and whether they support member-scoping.
- `app/api/dashboard-widgets/route.ts` — GET (load layout), POST (add widget), PATCH (bulk layout sync on drag/resize stop, or single config update for scope changes), DELETE.
- `components/dashboard/DashboardGrid.tsx` — the react-grid-layout wrapper. Edit mode toggles drag/resize; layout persists on drag/resize *stop*, not every frame.
- `components/dashboard/WidgetShell.tsx` + `ScopeBadge.tsx` — the card chrome every widget renders inside (drag handle, scope picker, remove button) — matches the mockup.
- `components/dashboard/AddWidgetPanel.tsx` — picker that reads straight from the registry.
- 6 widget components, all following the same fetch-by-scope-then-render pattern. `NetWorthWidget.tsx` is the fully-commented reference; the rest are stubs pointing at where to wire in your existing summary logic.

## Fixed since last version
- API route now imports `createServerDatabaseClient` from `@/platform/database/server-client` (confirmed by cloning the repo — it's async, so it's now `await`ed correctly). Previous version guessed at a sync `createServerSupabaseClient` that doesn't exist.
- **`useHouseholdMembers` didn't exist anywhere in the repo** — confirmed by searching. There was also no shared "list household people" endpoint; other pages (`app/spending/page.tsx`, `app/net-worth/page.tsx`, etc.) each query the `people` table inline. Added a real `app/api/household/members/route.ts` that follows that exact pattern (`getActiveHouseholdContext` → `householdPeopleOrFilter` → query `people` → `dedupeHouseholdPeople`), and a real `lib/hooks/useHouseholdMembers.ts` that calls it. `ScopeBadge.tsx` now points at something that actually exists.
- If you still see `Module not found: Can't resolve '@/lib/dashboard/widget-registry'` from a path like `./app/api/route.ts`, the file landed at `app/api/route.ts` instead of `app/api/dashboard-widgets/route.ts` during merge — move/rename it into the `dashboard-widgets` subfolder.

## Assumptions to check against your actual codebase
- Widget data fetches (`/api/investments/net-worth`, `/api/pensions/summary`, etc.) are placeholders. Swap each for the actual query/hook that already powers the current overview sections — this should mostly be extraction, not new logic, per your original scoping.

## New dependency
```
npm install react-grid-layout react-resizable
```

## Size-aware content (new)
- `lib/dashboard/size-tiers.ts` — `getSizeTier(w, h, definition)` resolves a widget's current grid dimensions to `"compact" | "default" | "expanded"` against its `minSize`/`maxSize`. This is the only place tier logic lives — widgets never compute their own.
- Every widget now receives `size: { w, h, tier }` in props and switches its own rendering on `size.tier`. No grid-level knowledge needed inside a widget.
- Resize handles now render on all 8 edges/corners (`components/dashboard/dashboard-grid.css` adds the positioning react-resizable doesn't ship by default) — appear on hover while in edit mode, matching how the drag handle already behaves.
- `maxSize` is now required on every registry entry (was optional) — it's both the resize ceiling react-grid-layout enforces and the threshold `getSizeTier` uses for "expanded".
- Reference implementations of tier-switching, matching what you asked for directly:
  - **Cashflow**: bars (default) → pie via `conic-gradient` (compact) → full Sankey slot (expanded).
  - **Investments**: total only (compact) → total + top 3 movers (default) → total + top 6 movers + chart slot (expanded).
  - **Income**: total (compact/default) → total + source breakdown (expanded).
- Net worth, pension, and spending widgets still render one view regardless of tier — same pattern applies whenever you want to add tiers to them, just branch on `size.tier` the same way.

## Not done yet (next steps)
- CSS for `.widget-card`, `.scope-badge`, `.add-widget-panel`, etc. — mockup gives the visual target, actual styles need writing against your design tokens.
- The page that mounts `<DashboardGrid />` — needs to fetch `initialWidgets` server-side from `user_dashboard_widgets` and pass in `householdId`.
- Seeding a sensible default layout for first-time users (currently an empty grid until they add widgets).
