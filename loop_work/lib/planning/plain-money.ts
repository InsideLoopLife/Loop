// Turns month plans into plain answers: what changed and why, what's coming,
// and how long savings would last. Everything is worded as its effect on the
// money left over, so "up" always means better off and "down" worse off.
import type { MonthPlan, MonthPlanLine } from "@/lib/planning/month-plan";

export type MoneyDriver = {
  key: string;
  name: string;
  kind: "in" | "out";
  before: number;
  after: number;
  /** Effect on money left over: positive is good. */
  effect: number;
  text: string;
  /** Yearly effect, when it's an ongoing change to a regular amount. */
  yearly: number | null;
};

export type OutlookItem = {
  month: string;
  label: string;
  effect: number;
  text: string;
  /** True when the change carries on into the following months. */
  lasting: boolean;
  surplus: number;
};

const shortName = (label: string) => (label.split(" · ").pop() || label).trim();

function totals(lines: MonthPlanLine[], kind: "in" | "out") {
  const map = new Map<string, { name: string; value: number }>();
  for (const line of lines) {
    const key = `${kind}:${line.label}`;
    const current = map.get(key);
    map.set(key, { name: shortName(line.label), value: (current?.value || 0) + Number(line.value || 0) });
  }
  return map;
}

const pounds = (n: number) => `£${Math.round(Math.abs(n)).toLocaleString("en-GB")}`;

/** The biggest reasons the money left over differs between two months. */
export function monthDrivers(before: MonthPlan, after: MonthPlan, limit = 3, threshold = 5, phrasing: "compare" | "ahead" = "compare"): MoneyDriver[] {
  const out: MoneyDriver[] = [];
  for (const kind of ["in", "out"] as const) {
    const a = totals(kind === "in" ? before.incomeItems : before.outgoingItems, kind);
    const b = totals(kind === "in" ? after.incomeItems : after.outgoingItems, kind);
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const was = a.get(key)?.value || 0;
      const now = b.get(key)?.value || 0;
      const diff = now - was;
      if (Math.abs(diff) < threshold) continue;
      const name = b.get(key)?.name || a.get(key)?.name || "Something";
      const effect = kind === "in" ? diff : -diff;
      let text: string;
      if (phrasing === "ahead") {
        text = was === 0 ? `${name} ${pounds(now)}${kind === "in" ? " comes in" : ""}` : now === 0 ? `no ${name}` : `${name} ${diff > 0 ? "up" : "down"} ${pounds(diff)}`;
      } else if (kind === "out") {
        if (was === 0) text = `${name} is due (${pounds(now)})`;
        else if (now === 0) text = `No ${name} this time (${pounds(was)} saved)`;
        else text = `${name} ${diff > 0 ? "up" : "down"} ${pounds(diff)}`;
      } else {
        if (was === 0) text = `${name} comes in (${pounds(now)})`;
        else if (now === 0) text = `No ${name} this time (${pounds(was)} less)`;
        else text = `${name} ${diff > 0 ? "up" : "down"} ${pounds(diff)}`;
      }
      out.push({ key, name, kind, before: was, after: now, effect, text, yearly: was > 0 && now > 0 ? effect * 12 : null });
    }
  }
  return out.sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect)).slice(0, limit);
}

/**
 * Notable changes in the months ahead, month on month, so a one-off shows
 * once ("in December") and a lasting change shows once ("from May").
 * `plans` starts with the current month.
 */
export function outlook(plans: MonthPlan[], months = 6, threshold = 50, limit = 4): OutlookItem[] {
  const items: OutlookItem[] = [];
  for (let i = 1; i <= Math.min(months, plans.length - 1); i++) {
    const drivers = monthDrivers(plans[i - 1], plans[i], 2, threshold, "ahead");
    const top = drivers[0];
    if (!top) continue;
    // Is this a return to normal after a one-off we already mentioned?
    const previous = items[items.length - 1];
    if (previous && !previous.lasting && previous.month === plans[i - 1].month && Math.sign(top.effect) !== Math.sign(previous.effect)) continue;
    const following = plans[i + 1];
    const lasting = following
      ? Math.abs(([...totals(top.kind === "in" ? following.incomeItems : following.outgoingItems, top.kind).entries()].find(([key]) => key === top.key)?.[1].value || 0) - top.after) < threshold
      : true;
    const total = plans[i].surplus - plans[i - 1].surplus;
    items.push({ month: plans[i].month, label: plans[i].label, effect: total, text: drivers.map((d) => d.text).join(", ").replace(/^./, (c) => c.toUpperCase()), lasting, surplus: plans[i].surplus });
  }
  return items.sort((a, b) => a.month.localeCompare(b.month)).slice(0, limit);
}
