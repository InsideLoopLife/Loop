// components/dashboard/ScopeBadge.tsx
"use client";

import { useState } from "react";
import type { WidgetScope } from "@/lib/dashboard/types";
import { useHouseholdMembers } from "@/lib/hooks/useHouseholdMembers"; // assumes existing hook — adjust path if named differently

interface ScopeBadgeProps {
  scope: WidgetScope;
  onChange: (scope: WidgetScope) => void;
}

export function ScopeBadge({ scope, onChange }: ScopeBadgeProps) {
  const [open, setOpen] = useState(false);
  const { members } = useHouseholdMembers();

  const label =
    scope.kind === "household"
      ? "Household"
      : members?.find((m) => m.id === scope.memberId)?.displayName ?? "Member";

  return (
    <div className="scope-badge">
      <button className="scope-badge__trigger" onClick={() => setOpen((v) => !v)}>
        {label}
      </button>

      {open && (
        <div className="scope-badge__menu">
          <button
            onClick={() => {
              onChange({ kind: "household" });
              setOpen(false);
            }}
          >
            Household
          </button>
          {members?.map((member) => (
            <button
              key={member.id}
              onClick={() => {
                onChange({ kind: "member", memberId: member.id });
                setOpen(false);
              }}
            >
              {member.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
