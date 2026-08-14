// lib/dashboard/widget-registry.tsx
//
// Adding a new widget later = write the component, add one entry here.
// Nothing about the grid, drag/resize, or persistence needs to change.

import type { WidgetDefinition } from "./dashboard/types";
import { NetWorthWidget } from "@/components/dashboard/widgets/NetWorthWidget";
import { PensionSummaryWidget } from "@/components/dashboard/widgets/PensionSummaryWidget";
import { InvestmentSummaryWidget } from "@/components/dashboard/widgets/InvestmentSummaryWidget";
import { SpendingSummaryWidget } from "@/components/dashboard/widgets/SpendingSummaryWidget";
import { IncomeSummaryWidget } from "@/components/dashboard/widgets/IncomeSummaryWidget";
import { CashflowWidget } from "@/components/dashboard/widgets/CashflowWidget";

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  net_worth: {
    type: "net_worth",
    label: "Net worth",
    description: "Total assets minus liabilities, with monthly change.",
    icon: "ti-report-money",
    needsMemberScope: true,
    defaultSize: { w: 2, h: 1 },
    minSize: { w: 1, h: 1 },
    maxSize: { w: 4, h: 2 },
    component: NetWorthWidget,
  },
  pension_summary: {
    type: "pension_summary",
    label: "Pension",
    description: "Current pension pot value and provider breakdown.",
    icon: "ti-pig-money",
    needsMemberScope: true,
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    maxSize: { w: 2, h: 2 },
    component: PensionSummaryWidget,
  },
  investment_summary: {
    type: "investment_summary",
    label: "Investments",
    description: "Portfolio value with top holdings and day movers.",
    icon: "ti-chart-line",
    needsMemberScope: true,
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    maxSize: { w: 4, h: 3 },
    component: InvestmentSummaryWidget,
  },
  spending_summary: {
    type: "spending_summary",
    label: "Spending",
    description: "Spend total for the period, by category.",
    icon: "ti-shopping-cart",
    needsMemberScope: true,
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    maxSize: { w: 2, h: 2 },
    component: SpendingSummaryWidget,
  },
  income_summary: {
    type: "income_summary",
    label: "Income",
    description: "Income total for the period.",
    icon: "ti-cash",
    needsMemberScope: true,
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    maxSize: { w: 2, h: 2 },
    component: IncomeSummaryWidget,
  },
  cashflow: {
    type: "cashflow",
    label: "Cashflow",
    description: "Income split across spending, savings and investments.",
    icon: "ti-arrows-split",
    needsMemberScope: false, // Sankey is inherently a household-level view
    defaultSize: { w: 2, h: 1 },
    minSize: { w: 1, h: 1 }, // below default it switches bars -> pie, see CashflowWidget
    maxSize: { w: 4, h: 3 },
    component: CashflowWidget,
  },
};

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[type];
}

export function listWidgetDefinitions(): WidgetDefinition[] {
  return Object.values(WIDGET_REGISTRY);
}
