// "Can I afford it?" — plain maths on the household's own forecast.
//   One-off purchase in month M: savings now + what's left over each month until M, minus the cost,
//   must still leave the safety buffer (a few months of essential bills).
//   Monthly cost (finance, a new bill) from month M for N months: every one of those months must
//   still have some money left over after the payment.

export type ForecastMonth = { month: string; leftOver: number; income: number };
export type Verdict = "yes" | "tight" | "not_yet";

export type OneOffResult = {
  mode: "one_off";
  verdict: Verdict;
  available: number;
  afterPurchase: number;
  buffer: number;
  shortBy: number;
  earliestMonth: string | null;
  extraPerMonth: number | null;
  path: Array<{ month: string; available: number }>;
};

export type MonthlyResult = {
  mode: "monthly";
  verdict: Verdict;
  worstMonth: string | null;
  worstLeft: number;
  comfortable: number;
  monthsChecked: number;
  rows: Array<{ month: string; leftBefore: number; leftAfter: number }>;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** One-off purchase paid in `when`. Money left over counts from the current month to `when`, inclusive. */
export function checkOneOff({ cost, when, savingsNow, forecast, buffer }: {
  cost: number;
  when: string;
  savingsNow: number;
  forecast: ForecastMonth[];
  buffer: number;
}): OneOffResult {
  let running = savingsNow;
  const path: OneOffResult["path"] = [];
  let available = savingsNow;
  let earliestMonth: string | null = null;
  for (const m of forecast) {
    running += m.leftOver;
    path.push({ month: m.month, available: r2(running) });
    if (m.month <= when) available = running;
    if (!earliestMonth && running - cost >= buffer) earliestMonth = m.month;
  }
  const afterPurchase = available - cost;
  const verdict: Verdict = afterPurchase >= buffer ? "yes" : afterPurchase >= 0 ? "tight" : "not_yet";
  const monthsUntil = Math.max(1, forecast.filter((m) => m.month <= when).length);
  const shortBy = Math.max(0, cost + buffer - available);
  return {
    mode: "one_off",
    verdict,
    available: r2(available),
    afterPurchase: r2(afterPurchase),
    buffer: r2(buffer),
    shortBy: r2(shortBy),
    earliestMonth,
    extraPerMonth: shortBy > 0 ? Math.ceil(shortBy / monthsUntil) : null,
    path,
  };
}

/** A monthly cost starting in `when` for `months` months (0 = ongoing; checks the forecast available). */
export function checkMonthly({ cost, when, months, forecast }: {
  cost: number;
  when: string;
  months: number;
  forecast: ForecastMonth[];
}): MonthlyResult {
  const span = forecast.filter((m) => m.month >= when).slice(0, months > 0 ? months : undefined);
  const rows = span.map((m) => ({ month: m.month, leftBefore: r2(m.leftOver), leftAfter: r2(m.leftOver - cost) }));
  const worst = rows.reduce<(typeof rows)[number] | null>((w, r) => (!w || r.leftAfter < w.leftAfter ? r : w), null);
  // "Comfortable" = still at least a tenth of take-home (and £200) left over in the worst month.
  const income = span.length ? span.reduce((s, m) => s + m.income, 0) / span.length : 0;
  const comfortable = Math.max(200, income * 0.1);
  const worstLeft = worst ? worst.leftAfter : 0;
  const verdict: Verdict = !worst ? "not_yet" : worstLeft >= comfortable ? "yes" : worstLeft >= 0 ? "tight" : "not_yet";
  return { mode: "monthly", verdict, worstMonth: worst?.month ?? null, worstLeft: r2(worstLeft), comfortable: r2(comfortable), monthsChecked: rows.length, rows };
}
