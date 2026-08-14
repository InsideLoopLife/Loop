// lib/dashboard/types.ts

export type WidgetScope =
  | { kind: "household" }
  | { kind: "member"; memberId: string };

export interface WidgetConfig {
  scope?: WidgetScope;
  period?: "7d" | "30d" | "90d" | "ytd" | "1y" | "all";
  [key: string]: unknown; // widget-specific extras (chart style, category filter, etc)
}

export interface DashboardWidgetRecord {
  id: string;
  user_id: string;
  household_id: string | null;
  widget_type: string;
  config: WidgetConfig;
  layout_x: number;
  layout_y: number;
  layout_w: number;
  layout_h: number;
  created_at: string;
  updated_at: string;
}

// Three content tiers a widget can render. The grid never tells a widget
// its exact pixel size — only which tier it's currently in — so widgets stay
// decoupled from grid math and just switch on `size.tier`.
export type SizeTier = "compact" | "default" | "expanded";

export interface WidgetSize {
  w: number; // current grid columns
  h: number; // current grid rows
  tier: SizeTier;
}

export interface CalendarMonthWidgetData {
  month: string;
  label: string;
  income: number;
  outgoings: number;
  surplus: number;
}

export interface DashboardWidgetContext {
  overview?: {
    income: number;
    outgoings: number;
    savings: number;
    leftOver: number;
    assets: number;
    liabilities: number;
    netWorth: number;
    pensionValue: number;
    investmentValue: number;
    pensionChange: number;
    investmentChange: number;
  };
  calendar?: {
    selectedYear: number;
    selectedMonth: string;
    months: CalendarMonthWidgetData[];
  };
}

// Shared widget inputs. Dashboard context contains already-computed, serialisable
// overview data so widgets can reuse the page's canonical totals without issuing
// duplicate client requests.
export interface WidgetProps {
  id: string;
  config: WidgetConfig;
  householdId: string;
  size: WidgetSize;
  dashboardContext?: DashboardWidgetContext;
  onConfigChange: (next: WidgetConfig) => void;
}

export interface WidgetDefinition {
  type: string; // stable key, stored in widget_type — never rename once shipped
  label: string;
  description: string;
  icon: string; // tabler icon name, e.g. "ti-pig-money"
  needsMemberScope: boolean; // does this widget support per-member scoping?
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number }; // hard floor — below this the widget stops being legible
  maxSize: { w: number; h: number }; // hard ceiling — the "expanded" tier tops out here
  component: React.ComponentType<WidgetProps>;
}
