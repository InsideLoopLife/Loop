// components/dashboard/AddWidgetPanel.tsx
"use client";

import { listWidgetDefinitions } from "@/lib/dashboard/widget-registry";

interface AddWidgetPanelProps {
  onSelect: (widgetType: string) => void;
  onClose: () => void;
}

export function AddWidgetPanel({ onSelect, onClose }: AddWidgetPanelProps) {
  const definitions = listWidgetDefinitions();

  return (
    <div className="add-widget-overlay" onClick={onClose}>
      <div className="add-widget-panel" onClick={(e) => e.stopPropagation()}>
        <div className="add-widget-panel__header">
          <span>Add a widget</span>
          <button onClick={onClose} aria-label="Close">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <div className="add-widget-panel__grid">
          {definitions.map((def) => (
            <button
              key={def.type}
              className="add-widget-panel__item"
              onClick={() => onSelect(def.type)}
            >
              <i className={`ti ${def.icon}`} aria-hidden="true" />
              <span className="add-widget-panel__item-label">{def.label}</span>
              <span className="add-widget-panel__item-desc">{def.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
