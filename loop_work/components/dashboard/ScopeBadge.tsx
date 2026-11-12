// components/dashboard/ScopeBadge.tsx
"use client";

import type { WidgetScope } from "@/lib/dashboard/types";

// Widgets show the whole household. Per-person widgets need per-person
// summaries that don't exist yet, so there's no person picker for now.
export function ScopeBadge(_props: { scope: WidgetScope; onChange: (scope: WidgetScope) => void }) {
  return (
    <div className="scope-badge">
      <span className="scope-badge__trigger">Household</span>
    </div>
  );
}
