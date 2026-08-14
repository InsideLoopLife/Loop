// components/dashboard/DashboardGrid.tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import { WidgetShell } from "./WidgetShell";
import { AddWidgetPanel } from "./AddWidgetPanel";
import { getWidgetDefinition } from "@/lib/dashboard/widget-registry";
import { getSizeTier } from "@/lib/dashboard/size-tiers";
import type { DashboardWidgetRecord, WidgetConfig } from "@/lib/dashboard/types";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./dashboard-grid.css"; // handle styling for n/s/e/w + corners, see that file

const ResponsiveGridLayout = WidthProvider(Responsive);

const COLS = { lg: 4, md: 4, sm: 2 };
const BREAKPOINTS = { lg: 1024, md: 768, sm: 0 };

// All 8 directions. react-grid-layout renders a handle div per entry and
// positions it via the .react-resizable-handle-{dir} classes in dashboard-grid.css.
const RESIZE_HANDLES: Array<"s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne"> = [
  "s",
  "w",
  "e",
  "n",
  "sw",
  "nw",
  "se",
  "ne",
];

interface DashboardGridProps {
  householdId: string;
  initialWidgets: DashboardWidgetRecord[];
}

export function DashboardGrid({ householdId, initialWidgets }: DashboardGridProps) {
  const [widgets, setWidgets] = useState(initialWidgets);
  const [editing, setEditing] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  const layouts = useMemo(() => {
    const lg: Layout[] = widgets.map((w) => ({
      i: w.id,
      x: w.layout_x,
      y: w.layout_y,
      w: w.layout_w,
      h: w.layout_h,
      minW: getWidgetDefinition(w.widget_type)?.minSize.w ?? 1,
      minH: getWidgetDefinition(w.widget_type)?.minSize.h ?? 1,
      maxW: getWidgetDefinition(w.widget_type)?.maxSize.w,
      maxH: getWidgetDefinition(w.widget_type)?.maxSize.h,
      resizeHandles: RESIZE_HANDLES,
    }));
    return { lg, md: lg, sm: lg };
  }, [widgets]);

  // Persist layout only when the user finishes a drag/resize, not on every frame
  const handleLayoutChangeCommitted = useCallback(
    async (layout: Layout[]) => {
      const payload = layout.map((item) => ({
        id: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      }));

      setWidgets((prev) =>
        prev.map((w) => {
          const match = payload.find((p) => p.id === w.id);
          return match
            ? { ...w, layout_x: match.x, layout_y: match.y, layout_w: match.w, layout_h: match.h }
            : w;
        })
      );

      await fetch("/api/dashboard-widgets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: payload }),
      });
    },
    []
  );

  const handleConfigChange = useCallback(async (id: string, config: WidgetConfig) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, config } : w)));
    await fetch("/api/dashboard-widgets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, config }),
    });
  }, []);

  const handleRemove = useCallback(async (id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    await fetch(`/api/dashboard-widgets?id=${id}`, { method: "DELETE" });
  }, []);

  const handleAddWidget = useCallback(
    async (widgetType: string) => {
      const definition = getWidgetDefinition(widgetType);
      if (!definition) return;

      const res = await fetch("/api/dashboard-widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widget_type: widgetType,
          household_id: householdId,
          config: { scope: { kind: "household" } },
        }),
      });
      const { widget } = await res.json();
      if (widget) setWidgets((prev) => [...prev, widget]);
      setAddPanelOpen(false);
    },
    [householdId]
  );

  return (
    <div>
      <div className="dashboard-toolbar">
        <button onClick={() => setEditing((v) => !v)}>
          {editing ? "Done" : "Edit layout"}
        </button>
        {editing && (
          <button onClick={() => setAddPanelOpen(true)}>Add widget</button>
        )}
      </div>

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        cols={COLS}
        breakpoints={BREAKPOINTS}
        rowHeight={140}
        isDraggable={editing}
        isResizable={editing}
        resizeHandles={RESIZE_HANDLES}
        draggableHandle=".widget-drag-handle"
        onDragStop={(layout) => handleLayoutChangeCommitted(layout)}
        onResizeStop={(layout) => handleLayoutChangeCommitted(layout)}
        compactType="vertical"
        margin={[12, 12]}
      >
        {widgets.map((widget) => {
          const definition = getWidgetDefinition(widget.widget_type);
          if (!definition) return null; // unknown/retired widget type — skip silently
          const Component = definition.component;
          const tier = getSizeTier(widget.layout_w, widget.layout_h, definition);

          return (
            <div key={widget.id}>
              <WidgetShell
                definition={definition}
                editing={editing}
                config={widget.config}
                onConfigChange={(next) => handleConfigChange(widget.id, next)}
                onRemove={() => handleRemove(widget.id)}
              >
                <Component
                  id={widget.id}
                  config={widget.config}
                  householdId={householdId}
                  size={{ w: widget.layout_w, h: widget.layout_h, tier }}
                  onConfigChange={(next) => handleConfigChange(widget.id, next)}
                />
              </WidgetShell>
            </div>
          );
        })}
      </ResponsiveGridLayout>

      {addPanelOpen && (
        <AddWidgetPanel onSelect={handleAddWidget} onClose={() => setAddPanelOpen(false)} />
      )}
    </div>
  );
}
