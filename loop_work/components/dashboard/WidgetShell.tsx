// components/dashboard/WidgetShell.tsx
"use client";

import type { ReactNode } from "react";
import { GripVertical, X } from "lucide-react";
import type { WidgetConfig, WidgetDefinition } from "@/lib/dashboard/types";
import { ScopeBadge } from "./ScopeBadge";

interface WidgetShellProps {
  definition: WidgetDefinition;
  editing: boolean;
  config: WidgetConfig;
  onConfigChange: (next: WidgetConfig) => void;
  onRemove: () => void;
  children: ReactNode;
}

export function WidgetShell({
  definition,
  editing,
  config,
  onConfigChange,
  onRemove,
  children,
}: WidgetShellProps) {
  return (
    <div className={`widget-card ${editing ? "widget-card--editing" : ""}`}>
      <div className="widget-card__header">
        {editing && (
          <span className="widget-drag-handle" title="Drag to move">
            <GripVertical aria-hidden="true" />
          </span>
        )}
        <span className="widget-card__title">{definition.label}</span>

        {definition.needsMemberScope && (
          <ScopeBadge
            scope={config.scope ?? { kind: "household" }}
            onChange={(scope) => onConfigChange({ ...config, scope })}
          />
        )}

        {editing && (
          <button
            className="widget-card__remove"
            onClick={onRemove}
            aria-label={`Remove ${definition.label} widget`}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="widget-card__body">{children}</div>
    </div>
  );
}
