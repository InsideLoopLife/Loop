// The "Flow" view on Overview: just the household's joint account(s) — what comes in (transfers from
// each person, Child Benefit…) and what goes out (bills by category, then each payment).
import type { AccountActivity, AccountLine } from "@/lib/accounts/account-activity";
import type { FlowChart, FlowChartLink, FlowChartNode } from "@/lib/planning/flow-chart";

const OUT_COLOURS = ["#fb923c", "#f59e0b", "#fb7185", "#c084fc", "#38bdf8", "#4ade80", "#f472b6", "#a3a3a3"];
const r2 = (v: number) => Math.round(v * 100) / 100;

function sumBy<T>(items: T[], key: (item: T) => string, amount: (item: T) => number) {
  const totals = new Map<string, number>();
  for (const item of items) totals.set(key(item), (totals.get(key(item)) || 0) + amount(item));
  return [...totals.entries()].map(([label, value]) => ({ label, value })).filter((x) => x.value > 0.5).sort((a, b) => b.value - a.value);
}

/** "From Dan (Nationwide FlexDirect)" → "From Dan" — short enough to read; the account shows on hover. */
function inLabel(line: AccountLine) {
  const m = /^From (.+?) \((.+)\)$/.exec(line.label);
  if (m) return `From ${m[1]}`;
  return line.label;
}

export function buildAccountFlowCharts({ month, accounts, activity, categoryOf, pots = {} }: {
  month: string;
  accounts: Array<{ id: string; name: string }>;
  /** Pots inside each account: their monthly amount is set aside there, so it shows as its own destination. */
  pots?: Record<string, Array<{ id: string; name: string; monthly: number; purpose: "saving" | "spending" }>>;
  activity: Record<string, AccountActivity | undefined>;
  categoryOf: (line: AccountLine) => string;
}): { summary: FlowChart; detail: FlowChart; totalIn: number; totalOut: number } {
  const build = (withPayments: boolean): FlowChart => {
    const nodes: FlowChartNode[] = [];
    const links: FlowChartLink[] = [];
    for (const account of accounts) {
      const lines = activity[account.id]?.lines || [];
      const ins = sumBy(lines.filter((l) => l.direction === "in"), inLabel, (l) => l.amount);
      const outLines = lines.filter((l) => l.direction === "out");
      const cats = sumBy(outLines, categoryOf, (l) => l.amount);
      const accountPots = (pots[account.id] || []).filter((p) => p.monthly > 0.5);
      const totalIn = ins.reduce((s, x) => s + x.value, 0);
      const totalOut = cats.reduce((s, x) => s + x.value, 0) + accountPots.reduce((s, p) => s + p.monthly, 0);
      const acct = `acct:${account.id}`;
      nodes.push({ id: acct, label: account.name, value: r2(Math.max(totalIn, totalOut)), colour: "#0f172a", column: 1, href: "/bank-accounts" });
      for (const x of ins) {
        const id = `in:${account.id}:${x.label}`;
        const transfer = x.label.startsWith("From ");
        nodes.push({ id, label: x.label, value: r2(x.value), colour: transfer ? "#0ea5e9" : "#10b981", column: 0, href: transfer ? "/bank-accounts" : `/income?month=${month}` });
        links.push({ source: id, target: acct, value: r2(x.value), colour: transfer ? "#0ea5e9" : "#10b981" });
      }
      if (totalOut - totalIn > 0.5) {
        const id = `bal:${account.id}`;
        nodes.push({ id, label: "From the account's balance", value: r2(totalOut - totalIn), colour: "#94a3b8", column: 0, note: "more goes out than comes in" });
        links.push({ source: id, target: acct, value: r2(totalOut - totalIn), colour: "#94a3b8" });
      }
      cats.forEach((cat, i) => {
        const colour = OUT_COLOURS[i % OUT_COLOURS.length];
        const id = `cat:${account.id}:${cat.label}`;
        // A catch-all with one payment in it is named after that payment.
        const inCat = sumBy(outLines.filter((l) => categoryOf(l) === cat.label), (l) => l.label, (l) => l.amount);
        const label = inCat.length === 1 && /^Other/.test(cat.label) ? inCat[0].label : cat.label;
        nodes.push({ id, label, value: r2(cat.value), colour, column: 2, href: `/spending?month=${month}` });
        links.push({ source: acct, target: id, value: r2(cat.value), colour });
        if (!withPayments) return;
        const payments = sumBy(outLines.filter((l) => categoryOf(l) === cat.label), (l) => l.label, (l) => l.amount);
        if (payments.length < 2) return;
        const shown = payments.slice(0, 6);
        const rest = payments.slice(6).reduce((s, p) => s + p.value, 0);
        if (rest > 0.5) shown.push({ label: `${payments.length - 6} more`, value: rest });
        for (const p of shown) {
          const pid = `pay:${account.id}:${cat.label}:${p.label}`;
          nodes.push({ id: pid, label: p.label, value: r2(p.value), colour, column: 3, href: `/spending?month=${month}` });
          links.push({ source: id, target: pid, value: r2(p.value), colour });
        }
      });
      for (const pot of accountPots) {
        const id = `pot:${pot.id}`;
        const colour = pot.purpose === "spending" ? "#f59e0b" : "#10b981";
        nodes.push({ id, label: `${pot.name} pot`, value: r2(pot.monthly), colour, column: 2, href: "/bank-accounts", note: pot.purpose === "spending" ? "spending money set aside" : "saving" });
        links.push({ source: acct, target: id, value: r2(pot.monthly), colour });
      }
      if (totalIn - totalOut > 0.5) {
        const id = `left:${account.id}`;
        nodes.push({ id, label: accountPots.length ? "Not in a pot" : "Stays in the account", value: r2(totalIn - totalOut), colour: "#334155", column: 2, note: "not planned to go out" });
        links.push({ source: acct, target: id, value: r2(totalIn - totalOut), colour: "#334155" });
      }
    }
    return { nodes, links, columns: withPayments ? ["Comes in", "Account", "Goes out on", "Payments"] : ["Comes in", "Account", "Goes out on"] };
  };
  const totals = accounts.reduce((acc, a) => ({
    in: acc.in + (activity[a.id]?.in || 0),
    out: acc.out + (activity[a.id]?.out || 0) + (pots[a.id] || []).reduce((s, p) => s + (p.monthly > 0.5 ? p.monthly : 0), 0),
  }), { in: 0, out: 0 });
  return { summary: build(false), detail: build(true), totalIn: r2(totals.in), totalOut: r2(totals.out) };
}
