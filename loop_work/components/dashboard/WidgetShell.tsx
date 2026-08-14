// components/dashboard/WidgetShell.tsx
"use client";

import { useState, type ReactNode } from "react";
import { GripVertical, Settings2, X } from "lucide-react";
import type { WidgetConfig, WidgetDefinition } from "@/lib/dashboard/types";
import { ScopeBadge } from "./ScopeBadge";
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const appearance = config.preferences?.appearance ?? "soft";
  return (
    <div className={`widget-card widget-card--${appearance} ${editing ? "widget-card--editing" : ""}`}>
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

        <button className="widget-card__settings" onClick={() => setSettingsOpen(true)} aria-label={`Open ${definition.label} settings`} title="Widget settings"><Settings2 aria-hidden="true" /></button>

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
      {settingsOpen ? <WidgetSettingsPanel definition={definition} config={config} onChange={onConfigChange} onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
