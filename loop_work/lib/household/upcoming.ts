// Upcoming household cost changes and renewals over the next 12 months: bills that change
// price, start or stop, plus renewal dates (mortgage deal, energy fix, car MOT / tax / insurance /
// lease, appliance warranties).

export type UpcomingKind = "price_change" | "starts" | "ends" | "renewal" | "warranty";

export type UpcomingChange = {
  id: string;
  date: string;
  kind: UpcomingKind;
  title: string;
  detail: string;
  monthlyChange: number | null; // + more, − less
  action?: { label: string; href: string } | null;
  area: "home" | "cars" | "bills" | "mortgage" | "energy" | "appliances";
};

type Item = { id: string; label: string; amount: number | string; recurrence: string; start_date: string | null; end_date: string | null; end_behavior?: string | null; renewal_notice_days?: number | null };

const round = (v: number) => Math.round(v * 100) / 100;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const gbp = (v: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(v);
const monthly = (item: Item) => {
  const amount = Number(item.amount || 0);
  return item.recurrence === "annual" ? amount / 12 : item.recurrence === "quarterly" ? amount / 3 : item.recurrence === "four_weekly" ? (amount * 13) / 12 : amount;
};

/** Bills: price changes (one line ends and the same bill restarts at a new amount), new bills, bills ending. */
export function billChanges(items: Item[], today: string, horizon = addDays(today, 366)): UpcomingChange[] {
  const recurring = items.filter((i) => i.recurrence !== "one_off");
  const out: UpcomingChange[] = [];
  const pairedStarts = new Set<string>();

  for (const ending of recurring) {
    if (!ending.end_date || ending.end_date < today || ending.end_date > horizon) continue;
    const next = recurring.find((other) => other.id !== ending.id && other.label.trim().toLowerCase() === ending.label.trim().toLowerCase() && other.start_date && other.start_date > ending.end_date! && other.start_date <= addDays(ending.end_date!, 45));
    if (next) {
      pairedStarts.add(next.id);
      const change = round(monthly(next) - monthly(ending));
      out.push({
        id: `price-${ending.id}`,
        date: next.start_date as string,
        kind: "price_change",
        title: `${ending.label} ${change > 0 ? "goes up" : change < 0 ? "goes down" : "renews"}`,
        detail: `${gbp(monthly(ending))} → ${gbp(monthly(next))} a month`,
        monthlyChange: change,
        area: "bills",
        action: change > 0 ? { label: "Shop around", href: "/loopwatch" } : null,
      });
      continue;
    }
    const behaviour = ending.end_behavior || "drops_off";
    out.push({
      id: `end-${ending.id}`,
      date: ending.end_date,
      kind: behaviour === "renews" || behaviour === "review_needed" ? "renewal" : "ends",
      title: behaviour === "renews" ? `${ending.label} renews` : behaviour === "review_needed" ? `${ending.label} needs reviewing` : `${ending.label} ends`,
      detail: behaviour === "renews" ? `Check the new price before ${ending.end_date}${ending.renewal_notice_days ? ` — give ${ending.renewal_notice_days} days' notice to leave` : ""}` : behaviour === "review_needed" ? "Decide whether to keep, switch or cancel it" : `Saves ${gbp(monthly(ending))} a month from then`,
      monthlyChange: behaviour === "drops_off" ? -round(monthly(ending)) : null,
      area: "bills",
      action: behaviour === "drops_off" ? null : { label: "Compare", href: "/loopwatch" },
    });
  }

  for (const starting of recurring) {
    if (pairedStarts.has(starting.id) || !starting.start_date || starting.start_date <= today || starting.start_date > horizon) continue;
    // A bill that simply carries on from an earlier line (same label, ended just before) was paired above.
    out.push({
      id: `start-${starting.id}`,
      date: starting.start_date,
      kind: "starts",
      title: `${starting.label} starts`,
      detail: `${gbp(monthly(starting))} a month`,
      monthlyChange: round(monthly(starting)),
      area: "bills",
      action: null,
    });
  }
  return out;
}

export function sortUpcoming(list: UpcomingChange[]) {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
