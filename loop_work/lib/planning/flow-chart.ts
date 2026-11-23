// Data for the "Where your income goes" flow chart: a summary (income → spending / savings /
// cashflow → spending groups) and a detailed version (each income source → … → spending groups →
// categories, and savings → each account). Plain data, so a client component can draw it.

export type FlowChartNode = { id: string; label: string; value: number; colour: string; column: number; href?: string; note?: string };
export type FlowChartLink = { source: string; target: string; value: number; colour: string };
export type FlowChart = { nodes: FlowChartNode[]; links: FlowChartLink[]; columns: string[] };

export type FlowChartInput = {
  month: string;
  totalIncome: number;
  income: Array<{ key: string; label: string; amount: number; personLabel: string | null; colour: string }>;
  spending: number;
  savingsTotal: number;
  investmentsTotal: number;
  savings: Array<{ key: string; label: string; amount: number }>;
  investments: Array<{ key: string; label: string; amount: number }>;
  cashflow: number;
  groups: Array<{ label: string; amount: number; categories: Array<{ label: string; amount: number }> }>;
};

const PALETTE = { spending: "#f97316", savings: "#10b981", investments: "#8b5cf6", cashflow: "#334155" };
const GROUP_COLOURS = ["#fb923c", "#f59e0b", "#fb7185", "#c084fc", "#38bdf8", "#4ade80", "#f472b6", "#a3a3a3"];
const r2 = (v: number) => Math.round(v * 100) / 100;

function stageNodes(input: FlowChartInput) {
  const savingsTotal = input.savingsTotal;
  const investmentsTotal = input.investmentsTotal;
  return [
    { id: "spending", label: "Spending", value: input.spending, colour: PALETTE.spending, href: `/spending?month=${input.month}` },
    { id: "savings", label: "Savings", value: savingsTotal, colour: PALETTE.savings, href: "/accounts" },
    { id: "investments", label: "Investments", value: investmentsTotal, colour: PALETTE.investments, href: "/investments" },
    { id: "cashflow", label: "Left over", value: Math.max(0, input.cashflow), colour: PALETTE.cashflow, note: "not planned for yet" },
  ].filter((n) => n.value > 0.5);
}

function groupNodes(input: FlowChartInput, column: number) {
  const groups = [...input.groups].filter((g) => g.amount > 0.5).sort((a, b) => b.amount - a.amount);
  const grouped = groups.reduce((s, g) => s + g.amount, 0);
  if (input.spending - grouped > 1) {
    const other = groups.find((g) => g.label === "__ungrouped");
    if (other) other.amount += input.spending - grouped;
    else groups.push({ label: "__ungrouped", amount: input.spending - grouped, categories: [] });
  }
  return groups.map((g, i) => ({
    id: `group:${g.label}`,
    label: g.label === "__ungrouped" ? "Other spending" : g.label,
    value: r2(g.amount),
    colour: GROUP_COLOURS[i % GROUP_COLOURS.length],
    column,
    href: `/spending?month=${input.month}`,
    categories: g.categories,
  }));
}

function toNode(g: ReturnType<typeof groupNodes>[number]): FlowChartNode {
  return { id: g.id, label: g.label, value: g.value, colour: g.colour, column: g.column, href: g.href };
}

export function buildFlowCharts(input: FlowChartInput): { summary: FlowChart; detail: FlowChart } {
  const total = Math.max(1, input.totalIncome);
  const stages = stageNodes(input);

  // Summary: one income node, the main destinations, and spending's groups.
  const summaryGroups = groupNodes(input, 2);
  const summary: FlowChart = {
    columns: ["Money in", "Goes to", "Spending by group"],
    nodes: [
      { id: "income", label: "Income", value: r2(input.totalIncome), colour: "#8b5cf6", column: 0, href: `/income?month=${input.month}` },
      ...stages.map((n) => ({ ...n, value: r2(n.value), column: 1 })),
      ...(summaryGroups.length > 1 ? summaryGroups.map(toNode) : []),
    ],
    links: [
      ...stages.map((n) => ({ source: "income", target: n.id, value: n.value, colour: n.colour })),
      ...(summaryGroups.length > 1 ? summaryGroups.map((g) => ({ source: "spending", target: g.id, value: g.value, colour: g.colour })) : []),
    ],
  };
  if (summaryGroups.length <= 1) summary.columns = ["Money in", "Goes to"];

  // Detail: every income source, the destinations, groups, then categories / accounts.
  const sources = [...input.income].filter((s) => s.amount > 0.5).sort((a, b) => b.amount - a.amount);
  const detailGroups = groupNodes(input, 2);
  const categoryNodes: FlowChartNode[] = [];
  const categoryLinks: FlowChartLink[] = [];
  for (const group of detailGroups) {
    const cats = [...group.categories].filter((c) => c.amount > 0.5).sort((a, b) => b.amount - a.amount);
    if (cats.length <= 1) continue;
    const shown = cats.slice(0, 6);
    const rest = cats.slice(6).reduce((s, c) => s + c.amount, 0);
    if (rest > 0.5) shown.push({ label: `${cats.length - 6} more`, amount: rest });
    for (const cat of shown) {
      const id = `cat:${group.label}:${cat.label}`;
      categoryNodes.push({ id, label: cat.label, value: r2(cat.amount), colour: group.colour, column: 3, href: `/spending?month=${input.month}` });
      categoryLinks.push({ source: group.id, target: id, value: r2(cat.amount), colour: group.colour });
    }
  }
  // Each savings / investment destination, with anything not traced to one shown as "Other".
  const withRest = (items: FlowChartInput["savings"], total: number, otherLabel: string) => {
    const list = items.filter((s) => s.amount > 0.5);
    const traced = list.reduce((sum, s) => sum + s.amount, 0);
    return total - traced > 1 ? [...list, { key: "other", label: otherLabel, amount: total - traced }] : list;
  };
  const savingsNodes = [
    ...(input.savingsTotal > 0.5 ? withRest(input.savings, input.savingsTotal, "Other saving") : []).map((s) => ({ id: `save:${s.key}`, label: s.label, value: r2(s.amount), colour: PALETTE.savings, column: 2, parent: "savings" })),
    ...(input.investmentsTotal > 0.5 ? withRest(input.investments, input.investmentsTotal, "Other investing") : []).map((s) => ({ id: `inv:${s.key}`, label: s.label, value: r2(s.amount), colour: PALETTE.investments, column: 2, parent: "investments" })),
  ];

  const detail: FlowChart = {
    columns: ["Money in", "Goes to", "Groups & accounts", categoryNodes.length ? "Categories" : ""].filter(Boolean),
    nodes: [
      ...sources.map((s) => ({ id: `src:${s.key}`, label: s.personLabel ? `${s.personLabel} · ${s.label}` : s.label, value: r2(s.amount), colour: s.colour, column: 0, href: `/income?month=${input.month}` })),
      ...stages.map((n) => ({ ...n, value: r2(n.value), column: 1 })),
      ...detailGroups.map(toNode),
      ...savingsNodes.map((n) => ({ id: n.id, label: n.label, value: n.value, colour: n.colour, column: n.column })),
      ...categoryNodes,
    ],
    links: [
      // Money is pooled, so each source feeds each destination in proportion.
      ...sources.flatMap((s) => stages.map((n) => ({ source: `src:${s.key}`, target: n.id, value: r2((s.amount * n.value) / total), colour: s.colour }))),
      ...detailGroups.map((g) => ({ source: "spending", target: g.id, value: g.value, colour: g.colour })),
      ...savingsNodes.map((n) => ({ source: n.parent, target: n.id, value: n.value, colour: n.colour })),
      ...categoryLinks,
    ],
  };
  return { summary, detail };
}
