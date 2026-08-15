// lib/dashboard/widget-registry.tsx
//
// Adding a new widget later = write the component, add one entry here.
// Nothing about the grid, drag/resize, or persistence needs to change.

import type { WidgetDefinition } from "./types";
import { NetWorthWidget } from "@/components/dashboard/widgets/NetWorthWidget";
import { PensionSummaryWidget } from "@/components/dashboard/widgets/PensionSummaryWidget";
import { InvestmentSummaryWidget } from "@/components/dashboard/widgets/InvestmentSummaryWidget";
import { SpendingSummaryWidget } from "@/components/dashboard/widgets/SpendingSummaryWidget";
import { IncomeSummaryWidget } from "@/components/dashboard/widgets/IncomeSummaryWidget";
import { CashflowWidget } from "@/components/dashboard/widgets/CashflowWidget";
import { CalendarWidget } from "@/components/dashboard/widgets/CalendarWidget";
import { createInsightWidget } from "@/components/dashboard/widgets/InsightWidget";

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  calendar: {
    type: "calendar",
    label: "Year calendar",
    description: "See income, commitments and what is left across the year.",
    icon: "ti-calendar-stats",
    needsMemberScope: false,
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 4, h: 6 },
    component: CalendarWidget,
  },
  net_worth: {
    type: "net_worth",
    label: "Net worth",
    description: "Total assets minus liabilities, with monthly change.",
    icon: "ti-report-money",
    needsMemberScope: true,
    defaultSize: { w: 2, h: 1 },
    minSize: { w: 1, h: 1 },
    maxSize: { w: 4, h: 4 },
    component: NetWorthWidget,
  },
  pension_summary: {
    type: "pension_summary",
    label: "Pension",
    description: "Current pension pot value and provider breakdown.",
    icon: "ti-pig-money",
    needsMemberScope: true,
    defaultSize: { w: 2, h: 2 },
    minSize: { w: 1, h: 1 },
    maxSize: { w: 4, h: 4 },
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
  ...Object.fromEntries(([
    ["available_money", "Available money", "What remains after committed spending and saving.", "ti-wallet", "flow", "logic"],
    ["upcoming_payments", "Upcoming payments", "The next dated payments and their combined value.", "ti-calendar-dollar", "flow", "ready"],
    ["spending_pressure", "Spending pressure", "How much of income is already committed.", "ti-gauge", "flow", "ready"],
    ["income_changes", "Income changes", "See upcoming changes to household income.", "ti-trending-up", "flow", "ready"],
    ["family_costs", "Childcare & family costs", "Tracked childcare and activity costs over time.", "ti-baby-carriage", "flow", "ready"],
    ["bills_renewals", "Bills & renewals", "Contracts and household bills approaching review.", "ti-refresh-alert", "flow", "ready"],
    ["debt_payoff", "Debt position", "Tracked liabilities and mortgage balances.", "ti-arrow-down-circle", "flow", "logic"],
    ["savings_pots", "Savings & pots", "Accessible savings and progress across named goals.", "ti-pig-money", "saving", "ready"],
    ["emergency_runway", "Emergency runway", "Months of essential spending covered by accessible cash.", "ti-lifebuoy", "saving", "logic"],
    ["goal_progress", "Goal progress", "Your highest-priority active savings goal.", "ti-target-arrow", "saving", "ready"],
    ["interest_earned", "Interest earned", "Confirmed savings interest and current blended rate.", "ti-percentage", "saving", "ready"],
    ["isa_allowance", "ISA allowance", "Tracked ISA subscription and remaining allowance.", "ti-building-bank", "saving", "logic"],
    ["home_equity", "Home equity", "Property value less the linked mortgage balance.", "ti-home-dollar", "home", "ready"],
    ["mortgage_countdown", "Mortgage deal countdown", "Time until the current mortgage deal ends.", "ti-hourglass", "home", "ready"],
    ["affordability_snapshot", "Affordability snapshot", "An estimate-first view using income, spending and deposit data.", "ti-home-search", "home", "logic"],
    ["portfolio_allocation", "Portfolio allocation", "Where priced investments are concentrated.", "ti-chart-donut", "investing", "ready"],
    ["portfolio_movement", "Portfolio movement", "Verified movement from priced investment holdings.", "ti-chart-line", "investing", "ready"],
    ["pension_journey", "Pension journey", "Provider history, contributions and verified growth.", "ti-chart-arcs", "investing", "history"],
    ["retirement_readiness", "Retirement readiness", "Progress against the retirement plan saved in LOOP.", "ti-sunrise", "investing", "logic"],
    ["fees_drag", "Fees drag", "Annualised platform and fund fees from saved fee rates.", "ti-receipt-pound", "investing", "ready"],
    ["dividends_reinvestment", "Dividends & reinvestment", "Provider dividend cash and reinvested purchase activity.", "ti-repeat", "investing", "ready"],
    ["household_contribution", "Household contribution", "How committed costs are shared across people.", "ti-users", "household", "ready"],
    ["what_changed", "What changed?", "The largest evidenced movement since last month.", "ti-sparkles", "household", "ready"],
    ["data_freshness", "Data freshness", "Which connected values are current or need attention.", "ti-database-check", "household", "ready"],
    ["next_best_action", "Next best action", "One high-value action from LOOP's financial briefing.", "ti-arrow-right-circle", "household", "logic"],
  ] as const).map(([type, label, description, icon, category, readiness]) => [type, {
    type,
    label,
    description,
    icon,
    category,
    readiness,
    needsMemberScope: false,
    defaultSize: { w: 1, h: 2 },
    minSize: { w: 1, h: 1 },
    maxSize: { w: 4, h: 4 },
    component: createInsightWidget(type),
  }])),
};

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[type];
}

export function listWidgetDefinitions(): WidgetDefinition[] {
  return Object.values(WIDGET_REGISTRY);
}
