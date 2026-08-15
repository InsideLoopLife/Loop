import type { FinancialPositionWidgetData, PensionHistoryWidgetData, WidgetViewport } from "@/lib/dashboard/types";
import type { TrendPoint } from "./WidgetTrendChart";

const monthLabel = (date: Date) => date.toLocaleDateString("en-GB", { month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "2-digit" });
const dayLabel = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function projectionHorizon(configured: "auto" | 3 | 6 | 12 | undefined, viewport: WidgetViewport) {
  return configured && configured !== "auto" ? configured : viewport.forecastMonths;
}

export function historicalPoints(history: FinancialPositionWidgetData[], field: keyof FinancialPositionWidgetData, months: number): TrendPoint[] {
  const monthly = new Map<string, FinancialPositionWidgetData>();
  for (const snapshot of history) monthly.set(snapshot.date.slice(0, 7), snapshot);
  if (monthly.size < 2 && history.length > 1) {
    return history.slice(-Math.max(7, months * 4)).map((snapshot) => ({
      label: dayLabel(new Date(`${snapshot.date.slice(0, 10)}T12:00:00`)),
      value: Number(snapshot[field] || 0),
      kind: "actual" as const,
    }));
  }
  return Array.from(monthly.entries()).slice(-months).map(([key, snapshot]) => ({
    label: monthLabel(new Date(`${key}-01T12:00:00`)),
    value: Number(snapshot[field] || 0),
    kind: "actual" as const,
  }));
}

export function pensionHistoryPoints(history: PensionHistoryWidgetData[], months: number): TrendPoint[] {
  const monthly = new Map<string, PensionHistoryWidgetData>();
  for (const snapshot of history) monthly.set(snapshot.date.slice(0, 7), snapshot);
  if (monthly.size < 2 && history.length > 1) {
    return history.slice(-Math.max(7, months * 4)).map((snapshot) => ({
      label: dayLabel(new Date(`${snapshot.date.slice(0, 10)}T12:00:00`)),
      value: snapshot.value,
      kind: "actual" as const,
    }));
  }
  return Array.from(monthly.entries()).slice(-months).map(([key, snapshot]) => ({
    label: monthLabel(new Date(`${key}-01T12:00:00`)),
    value: snapshot.value,
    kind: "actual" as const,
  }));
}

export function projectedPoints(current: number, months: number, monthlyChange: (index: number, value: number) => number): TrendPoint[] {
  let value = current;
  return Array.from({ length: months }, (_, index) => {
    value = monthlyChange(index + 1, value);
    const date = new Date();
    date.setMonth(date.getMonth() + index + 1);
    return { label: monthLabel(date), value, kind: "forecast" as const };
  });
}
