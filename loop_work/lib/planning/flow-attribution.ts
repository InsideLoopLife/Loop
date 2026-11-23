// The detailed flow chart, traced by whose money it is. It uses Split's own maths, so the chart
// always agrees with Spending → Split:
//   - each person's pay funds their own spending, their own savings and their share of each Split group
//   - income that belongs to a group (e.g. Child Benefit in Kids) goes straight to that group
//   - other shared income (no owner, no group) is split evenly between the adults, as Split does
//   - shared payments that aren't in any group are shared in proportion to income, and say so
import { computeSplit, groupForLine, type SplitGroup, type SplitLine, type SplitSettings } from "@/lib/spending/split";
import type { FlowChart, FlowChartLink, FlowChartNode } from "@/lib/planning/flow-chart";

const GROUP_COLOURS = ["#fb923c", "#f59e0b", "#fb7185", "#38bdf8", "#4ade80", "#f472b6"];
const METHOD_LABEL: Record<string, string> = {
  equal_leftover: "equal leftover",
  equal: "50/50",
  income_share: "by income",
  custom: "custom split",
  one_person: "one person pays",
};
const r2 = (v: number) => Math.round(v * 100) / 100;

function topCategories(lines: SplitLine[], categoryName: (id: string | null) => string, limit = 6) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const label = line.categoryId ? categoryName(line.categoryId) : line.isMortgage ? "Mortgage" : line.isChildCost ? "Childcare" : line.isSavings ? line.title : "Uncategorised";
    totals.set(label, (totals.get(label) || 0) + line.amount);
  }
  const sorted = [...totals.entries()].map(([label, amount]) => ({ label, amount })).filter((c) => c.amount > 0.5).sort((a, b) => b.amount - a.amount);
  if (sorted.length <= limit) return sorted;
  const rest = sorted.slice(limit).reduce((s, c) => s + c.amount, 0);
  return [...sorted.slice(0, limit), { label: `${sorted.length - limit} more`, amount: rest }];
}

export function buildTracedFlow(input: {
  month: string;
  lines: SplitLine[];
  adults: Array<{ id: string; name: string; colour: string }>;
  childIds: Set<string>;
  groups: SplitGroup[];
  settings: SplitSettings;
  categoryName: (id: string | null) => string;
}): { chart: FlowChart; note: string } | null {
  const { adults, lines, groups, childIds, settings, month } = input;
  if (!adults.length) return null;
  const result = computeSplit({ lines, adults: adults.map((a) => ({ id: a.id, name: a.name })), childIds, groups, settings });
  const adultIds = new Set(adults.map((a) => a.id));
  const colourOf = new Map(adults.map((a) => [a.id, a.colour]));
  const nameOf = new Map(adults.map((a) => [a.id, a.name]));
  const ownedFromJoint = new Set(result.ownedFromJoint.map((l) => l.key));
  const owner = (line: SplitLine) => (line.personId && adultIds.has(line.personId) ? line.personId : null);

  const nodes: FlowChartNode[] = [];
  const links: FlowChartLink[] = [];
  const addLink = (source: string, target: string, value: number, colour: string) => {
    if (!(value > 0.5)) return;
    const existing = links.find((l) => l.source === source && l.target === target);
    if (existing) existing.value = r2(existing.value + value);
    else links.push({ source, target, value: r2(value), colour });
  };

  // Column 0 and 1: where each person's money comes from, then "<name>'s money".
  for (const adult of adults) {
    const p = result.people.find((x) => x.personId === adult.id);
    if (!p) continue;
    nodes.push({ id: `person:${adult.id}`, label: `${adult.name}'s money`, value: r2(p.income), colour: adult.colour, column: 1, href: `/income?month=${month}` });
  }
  const sharedIncomeLines: SplitLine[] = [];
  const groupIncomeLines = new Map<string, SplitLine[]>();
  for (const line of lines.filter((l) => l.direction === "income" && l.amount > 0)) {
    const group = groupForLine(line, groups, childIds);
    const who = owner(line);
    if (group) { groupIncomeLines.set(group.id, [...(groupIncomeLines.get(group.id) || []), line]); continue; }
    if (who) {
      nodes.push({ id: `src:${line.key}`, label: `${nameOf.get(who)} · ${line.title}`, value: r2(line.amount), colour: colourOf.get(who) || "#64748b", column: 0, href: `/income?month=${month}` });
      addLink(`src:${line.key}`, `person:${who}`, line.amount, colourOf.get(who) || "#64748b");
    } else sharedIncomeLines.push(line);
  }
  // Household income (e.g. Child Benefit) stays the household's: its own "whose money" box, which pays
  // towards the shared groups first. Split counts it half each, so each person's share is reduced by
  // their half and the household box pays that part instead — the totals match Split exactly.
  const HOUSEHOLD = "person:household";
  const householdIncome = sharedIncomeLines.reduce((sum, l) => sum + l.amount, 0);
  if (householdIncome > 0.5) {
    nodes.push({ id: HOUSEHOLD, label: "Household income", value: r2(householdIncome), colour: "#64748b", column: 1, href: `/income?month=${month}`, note: "pays towards shared costs first" });
    for (const line of sharedIncomeLines) {
      nodes.push({ id: `src:${line.key}`, label: line.title, value: r2(line.amount), colour: "#64748b", column: 0, href: `/income?month=${month}` });
      addLink(`src:${line.key}`, HOUSEHOLD, line.amount, "#94a3b8");
    }
  }
  const householdLeft = new Map(adults.map((a) => [a.id, result.people.find((x) => x.personId === a.id)?.sharedIncome || 0]));
  /** Pay `amount` on a person's behalf: household income first (up to their half), then their own money. */
  const payFor = (adultId: string, target: string, amount: number, colour: string) => {
    const fromHousehold = Math.min(Math.max(0, householdLeft.get(adultId) || 0), Math.max(0, amount));
    if (fromHousehold > 0) { householdLeft.set(adultId, (householdLeft.get(adultId) || 0) - fromHousehold); addLink(HOUSEHOLD, target, fromHousehold, "#94a3b8"); }
    addLink(`person:${adultId}`, target, amount - fromHousehold, colour);
  };

  // Column 2: Split groups, each person's own spending and savings, shared-but-ungrouped, and what's left.
  const groupNotes: string[] = [];
  result.groups.forEach((g, i) => {
    if (g.outgoing <= 0.5) return;
    const colour = GROUP_COLOURS[i % GROUP_COLOURS.length];
    const id = `group:${g.group.id}`;
    nodes.push({ id, label: g.group.name, value: r2(g.outgoing), colour, column: 2, href: `/spending?month=${month}`, note: METHOD_LABEL[g.group.method] });
    groupNotes.push(`${g.group.name} (${METHOD_LABEL[g.group.method] || g.group.method})`);
    for (const adult of adults) payFor(adult.id, id, g.shares[adult.id] || 0, adult.colour);
    for (const incomeLine of groupIncomeLines.get(g.group.id) || []) {
      const amount = Math.min(incomeLine.amount, g.outgoing);
      nodes.push({ id: `src:${incomeLine.key}`, label: `${incomeLine.title} (to ${g.group.name})`, value: r2(incomeLine.amount), colour: "#64748b", column: 0, href: `/income?month=${month}` });
      addLink(`src:${incomeLine.key}`, id, amount, "#94a3b8");
    }
    for (const c of topCategories(g.lines.filter((l) => l.direction === "outgoing"), input.categoryName)) {
      const cid = `cat:${g.group.id}:${c.label}`;
      nodes.push({ id: cid, label: c.label, value: r2(c.amount), colour, column: 3, href: `/spending?month=${month}` });
      addLink(id, cid, c.amount, colour);
    }
  });

  const sharedUngrouped = result.ungrouped.filter((l) => l.direction === "outgoing");
  const ungroupedTotal = sharedUngrouped.reduce((s, l) => s + l.amount, 0);
  const incomeTotal = result.people.reduce((s, p) => s + p.income + p.sharedIncome, 0);
  const ungroupedShare = (id: string) => {
    const p = result.people.find((x) => x.personId === id);
    return incomeTotal > 0 && p ? (ungroupedTotal * (p.income + p.sharedIncome)) / incomeTotal : ungroupedTotal / adults.length;
  };
  if (ungroupedTotal > 0.5) {
    nodes.push({ id: "shared-ungrouped", label: "Other shared costs", value: r2(ungroupedTotal), colour: "#a3a3a3", column: 2, href: `/spending?month=${month}`, note: "shared by income" });
    for (const adult of adults) payFor(adult.id, "shared-ungrouped", ungroupedShare(adult.id), adult.colour);
    for (const c of topCategories(sharedUngrouped, input.categoryName)) {
      const cid = `cat:ungrouped:${c.label}`;
      nodes.push({ id: cid, label: c.label, value: r2(c.amount), colour: "#a3a3a3", column: 3, href: `/spending?month=${month}` });
      addLink("shared-ungrouped", cid, c.amount, "#a3a3a3");
    }
  }

  for (const adult of adults) {
    const p = result.people.find((x) => x.personId === adult.id);
    if (!p) continue;
    const ownLines = lines.filter((l) => l.direction === "outgoing" && !l.isSavings && owner(l) === adult.id && (ownedFromJoint.has(l.key) || !groupForLine(l, groups, childIds)));
    const saveLines = lines.filter((l) => l.direction === "outgoing" && l.isSavings && owner(l) === adult.id);
    if (p.personalSpending > 0.5) {
      const id = `own:${adult.id}`;
      nodes.push({ id, label: `${adult.name}'s own spending`, value: r2(p.personalSpending), colour: adult.colour, column: 2, href: `/spending?month=${month}` });
      addLink(`person:${adult.id}`, id, p.personalSpending, adult.colour);
      for (const c of topCategories(ownLines, input.categoryName)) {
        const cid = `cat:own:${adult.id}:${c.label}`;
        nodes.push({ id: cid, label: c.label, value: r2(c.amount), colour: adult.colour, column: 3, href: `/spending?month=${month}` });
        addLink(id, cid, c.amount, adult.colour);
      }
    }
    if (p.savings > 0.5) {
      const id = `save:${adult.id}`;
      nodes.push({ id, label: `${adult.name}'s savings`, value: r2(p.savings), colour: "#10b981", column: 2, href: "/accounts" });
      addLink(`person:${adult.id}`, id, p.savings, adult.colour);
      const own = saveLines.reduce((s, l) => s + l.amount, 0);
      const cats = topCategories(saveLines, () => "");
      if (p.savings - own > 0.5) cats.push({ label: "Shared saving (half)", amount: p.savings - own });
      if (cats.length > 1 || (cats[0] && cats[0].label !== `${adult.name}'s savings`)) {
        for (const c of cats) {
          const cid = `cat:save:${adult.id}:${c.label}`;
          nodes.push({ id: cid, label: c.label, value: r2(c.amount), colour: "#10b981", column: 3, href: "/accounts" });
          addLink(id, cid, c.amount, "#10b981");
        }
      }
    }
    if (p.evenUp > 0.5) {
      const other = adults.find((a) => a.id !== adult.id);
      const id = `even:${adult.id}`;
      nodes.push({ id, label: `To ${other?.name ?? "the others"} (evening up)`, value: r2(p.evenUp), colour: "#94a3b8", column: 2 });
      addLink(`person:${adult.id}`, id, p.evenUp, adult.colour);
    }
    const spent = links.filter((l) => l.source === `person:${adult.id}`).reduce((s, l) => s + l.value, 0);
    const householdSpare = Math.max(0, householdLeft.get(adult.id) || 0);
    const left = r2(p.income + householdSpare - spent);
    if (left > 0.5) {
      const id = `left:${adult.id}`;
      nodes.push({ id, label: `${adult.name} has left`, value: left, colour: "#334155", column: 2, note: "not planned for yet" });
      addLink(`person:${adult.id}`, id, left - householdSpare, adult.colour);
      if (householdSpare > 0.5) addLink(HOUSEHOLD, id, householdSpare, "#94a3b8");
    } else if (left < -0.5) {
      const node = nodes.find((n) => n.id === `person:${adult.id}`);
      if (node) node.note = `${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(-left)} more planned than comes in`;
    }
  }

  const note = groupNotes.length
    ? `Each person's pay covers their own spending, their savings and their share of ${groupNotes.join(", ")}. Household income like Child Benefit goes to shared costs first.`
    : "Each person's pay covers their own spending and savings. Shared costs are shared by income. Household income like Child Benefit goes to shared costs first.";

  return { chart: { nodes, links, columns: ["Where it comes from", "Whose money", "What it pays for", "Categories"] }, note };
}
