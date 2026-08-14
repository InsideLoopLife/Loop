"use client";

import { X } from "lucide-react";
import type { WidgetConfig, WidgetDefinition } from "@/lib/dashboard/types";

export function WidgetSettingsPanel({ definition, config, onChange, onClose }: { definition: WidgetDefinition; config: WidgetConfig; onChange: (config: WidgetConfig) => void; onClose: () => void }) {
  const preferences = config.preferences ?? {};
  const update = (next: Partial<NonNullable<WidgetConfig["preferences"]>>) => onChange({ ...config, preferences: { ...preferences, ...next } });

  return (
    <div className="widget-settings" role="dialog" aria-modal="true" aria-label={`${definition.label} settings`}>
      <div className="widget-settings__header"><div><small>Widget settings</small><strong>{definition.label}</strong></div><button onClick={onClose} aria-label="Close settings"><X /></button></div>
      <label><span>Appearance</span><select value={preferences.appearance ?? "soft"} onChange={(event) => update({ appearance: event.target.value as "soft" | "flat" | "bold" })}><option value="soft">Soft</option><option value="flat">Flat</option><option value="bold">Bold</option></select></label>
      {definition.type === "calendar" ? <>
        <label><span>Calendar look</span><select value={preferences.calendarStyle ?? "seasonal"} onChange={(event) => update({ calendarStyle: event.target.value as "seasonal" | "flat" | "bars" })}><option value="seasonal">Seasonal</option><option value="flat">Flat</option><option value="bars">Coloured bars</option></select></label>
        <label><span>Emphasise</span><select value={preferences.calendarMetric ?? "surplus"} onChange={(event) => update({ calendarMetric: event.target.value as "surplus" | "commitment" | "income" })}><option value="surplus">Money left</option><option value="commitment">Committed</option><option value="income">Income</option></select></label>
      </> : null}
      {["net_worth", "pension_summary", "investment_summary"].includes(definition.type) ? <>
        <label className="widget-settings__toggle"><span>Show breakdown</span><input type="checkbox" checked={preferences.showBreakdown ?? true} onChange={(event) => update({ showBreakdown: event.target.checked })} /></label>
        <label className="widget-settings__toggle"><span>Show projection</span><input type="checkbox" checked={preferences.showProjection ?? definition.type !== "investment_summary"} onChange={(event) => update({ showProjection: event.target.checked })} /></label>
        <label><span>Projection</span><select value={preferences.projectionMonths ?? "auto"} onChange={(event) => update({ projectionMonths: event.target.value === "auto" ? "auto" : Number(event.target.value) as 3 | 6 | 12 })}><option value="auto">Automatic</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option></select></label>
      </> : null}
      {definition.type === "pension_summary" ? <label><span>Assumed annual growth</span><input type="number" min="0" max="15" step="0.5" value={preferences.assumedAnnualGrowth ?? 5} onChange={(event) => update({ assumedAnnualGrowth: Number(event.target.value) })} /></label> : null}
      <p>Saved to this widget and available on every device. Layout density still adapts automatically.</p>
    </div>
  );
}
