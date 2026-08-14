// components/dashboard/DashboardGrid.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Check, LayoutGrid, Plus, Sparkles } from "lucide-react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout/legacy";
import { WidgetShell } from "./WidgetShell";
import { AddWidgetPanel } from "./AddWidgetPanel";
import { getWidgetDefinition } from "@/lib/dashboard/widget-registry";
import { getSizeTier } from "@/lib/dashboard/size-tiers";
import type { DashboardWidgetContext, DashboardWidgetRecord, WidgetConfig } from "@/lib/dashboard/types";
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
  dashboardContext?: DashboardWidgetContext;
}

export function DashboardGrid({ householdId, initialWidgets, dashboardContext }: DashboardGridProps) {
  const [widgets, setWidgets] = useState(initialWidgets);
  const [editing, setEditing] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const findTarget = () => setActionTarget(document.getElementById("loop-page-actions"));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
  }, []);

  const stopLongPress = useCallback(() => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    pressOrigin.current = null;
  }, []);

  const startLongPress = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (editing || event.pointerType === "mouse") return;
    const target = event.target as HTMLElement;
    if (target.closest("a,button,input,select,textarea,[role='button']")) return;
    pressOrigin.current = { x: event.clientX, y: event.clientY };
    longPressTimer.current = window.setTimeout(() => {
      setEditing(true);
      longPressTimer.current = null;
      window.navigator.vibrate?.(18);
    }, 600);
  }, [editing]);

  const moveLongPress = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!pressOrigin.current) return;
    if (Math.hypot(event.clientX - pressOrigin.current.x, event.clientY - pressOrigin.current.y) > 10) stopLongPress();
  }, [stopLongPress]);

  const layouts = useMemo(() => {
    const lg: Layout = widgets.map((w) => ({
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
    async (layout: Layout) => {
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

  const toolbar = (
    <div className="dashboard-toolbar" aria-label="Overview layout controls">
      <button className="dashboard-toolbar__button dashboard-toolbar__button--add" onClick={() => { setEditing(true); setAddPanelOpen(true); }}>
        <Plus aria-hidden="true" /> <span>Add widget</span>
      </button>
      <button className={`dashboard-toolbar__button ${editing ? "is-active" : ""}`} onClick={() => setEditing((value) => !value)}>
        {editing ? <Check aria-hidden="true" /> : <LayoutGrid aria-hidden="true" />}
        <span>{editing ? "Done" : "Edit layout"}</span>
      </button>
    </div>
  );

  return (
    <>
      {actionTarget ? createPortal(toolbar, actionTarget) : null}
      <section
        className={`dashboard-widget-zone ${editing ? "dashboard-widget-zone--editing" : ""}`}
        onPointerDown={startLongPress}
        onPointerMove={moveLongPress}
        onPointerUp={stopLongPress}
        onPointerCancel={stopLongPress}
        onContextMenu={(event) => {
          if (editing && window.matchMedia("(max-width: 767px)").matches) event.preventDefault();
        }}
      >
        <div className="dashboard-widget-zone__heading">
          <div>
            <span className="dashboard-widget-zone__accent" />
            <h2>Your overview</h2>
            <p>{editing ? "Drag a handle to move a widget, or pull any edge to resize it." : "A flexible view of the information that matters to you."}</p>
          </div>
          {editing ? <span className="dashboard-edit-badge"><Sparkles aria-hidden="true" /> Editing</span> : null}
        </div>

        {widgets.length === 0 ? (
          <button className="dashboard-widget-empty" onClick={() => { setEditing(true); setAddPanelOpen(true); }}>
            <span><Plus aria-hidden="true" /></span>
            <strong>Build your overview</strong>
            <small>Choose from live previews including net worth, cashflow, pensions and the year calendar.</small>
          </button>
        ) : null}

      <ResponsiveGridLayout
        className="layout dashboard-widget-grid"
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
                  dashboardContext={dashboardContext}
                  onConfigChange={(next) => handleConfigChange(widget.id, next)}
                />
              </WidgetShell>
            </div>
          );
        })}
      </ResponsiveGridLayout>

        {editing ? (
          <div className="dashboard-mobile-toolbar">
            <button onClick={() => setAddPanelOpen(true)}><Plus aria-hidden="true" /> Add widget</button>
            <button onClick={() => setEditing(false)}><Check aria-hidden="true" /> Done</button>
          </div>
        ) : (
          <button className="dashboard-long-press-hint" onClick={() => setEditing(true)}><LayoutGrid aria-hidden="true" /> Touch and hold anywhere to edit</button>
        )}

      {addPanelOpen && (
        <AddWidgetPanel
          onSelect={handleAddWidget}
          onClose={() => setAddPanelOpen(false)}
          activeWidgetTypes={widgets.map((widget) => widget.widget_type)}
        />
      )}
      </section>
    </>
  );
}
