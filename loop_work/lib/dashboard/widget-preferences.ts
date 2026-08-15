import type { WidgetConfig } from "./types";

const PERIODS = new Set(["7d", "30d", "90d", "ytd", "1y", "all"]);
const APPEARANCES = new Set(["soft", "flat", "bold"]);
const CALENDAR_STYLES = new Set(["seasonal", "flat", "bars"]);
const CALENDAR_METRICS = new Set(["surplus", "commitment", "income"]);
const CALENDAR_RANGES = new Set([3, 6, 12]);
const PROJECTION_MONTHS = new Set(["auto", 3, 6, 12]);
const CHART_STYLES = new Set(["line", "area", "bars"]);

export function sanitizeWidgetConfig(input: unknown): WidgetConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const result: WidgetConfig = {};

  if (source.scope && typeof source.scope === "object") {
    const scope = source.scope as Record<string, unknown>;
    if (scope.kind === "household") result.scope = { kind: "household" };
    if (scope.kind === "member" && typeof scope.memberId === "string" && scope.memberId.length <= 100) {
      result.scope = { kind: "member", memberId: scope.memberId };
    }
  }
  if (typeof source.period === "string" && PERIODS.has(source.period)) result.period = source.period as WidgetConfig["period"];

  if (source.preferences && typeof source.preferences === "object" && !Array.isArray(source.preferences)) {
    const preferences = source.preferences as Record<string, unknown>;
    result.preferences = {};
    if (typeof preferences.appearance === "string" && APPEARANCES.has(preferences.appearance)) result.preferences.appearance = preferences.appearance as "soft" | "flat" | "bold";
    if (typeof preferences.calendarStyle === "string" && CALENDAR_STYLES.has(preferences.calendarStyle)) result.preferences.calendarStyle = preferences.calendarStyle as "seasonal" | "flat" | "bars";
    if (typeof preferences.calendarMetric === "string" && CALENDAR_METRICS.has(preferences.calendarMetric)) result.preferences.calendarMetric = preferences.calendarMetric as "surplus" | "commitment" | "income";
    if (CALENDAR_RANGES.has(preferences.calendarRange as number)) result.preferences.calendarRange = preferences.calendarRange as 3 | 6 | 12;
    if (typeof preferences.showBreakdown === "boolean") result.preferences.showBreakdown = preferences.showBreakdown;
    if (typeof preferences.showProjection === "boolean") result.preferences.showProjection = preferences.showProjection;
    if (PROJECTION_MONTHS.has(preferences.projectionMonths as string | number)) result.preferences.projectionMonths = preferences.projectionMonths as "auto" | 3 | 6 | 12;
    if (typeof preferences.chartStyle === "string" && CHART_STYLES.has(preferences.chartStyle)) result.preferences.chartStyle = preferences.chartStyle as "line" | "area" | "bars";
  }
  return result;
}
