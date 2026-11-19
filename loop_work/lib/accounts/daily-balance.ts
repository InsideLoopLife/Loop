// An account's balance day by day through a month, worked out from one known point (the anchor) and
// the lines that move money in and out.
//   - "start": the balance at the START of the anchor day — used when Loop starts tracking from payday.
//     Days before it are unknown.
//   - "end": the balance at the END of the anchor day — a balance someone checked and typed in. Days
//     before it are worked back from the lines; days after are worked forward.
import type { AccountLine } from "@/lib/accounts/account-activity";

export type BalanceAnchor = { date: string; balance: number; mode: "start" | "end" };
export type BalanceDay = { date: string; balance: number | null; lines: Array<AccountLine & { after: number | null }> };
export type BalanceTimeline = {
  days: BalanceDay[];
  anchor: BalanceAnchor;
  /** First day with a known balance in this month (null when none). */
  knownFrom: string | null;
  low: { balance: number; date: string; line: AccountLine | null } | null;
  end: number | null;
  today: number | null;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const signed = (l: AccountLine) => (l.direction === "in" ? l.amount : -l.amount);

export function daysOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** Lines placed on a day of the month (undated ones on the 1st), money in first on each day. */
export function linesByDay(month: string, lines: AccountLine[]) {
  const days = daysOf(month);
  const first = days[0];
  const last = days[days.length - 1];
  const byDay = new Map<string, AccountLine[]>();
  for (const line of lines) {
    const date = line.date && line.date >= first && line.date <= last ? line.date : first;
    byDay.set(date, [...(byDay.get(date) || []), line]);
  }
  for (const [date, list] of byDay) byDay.set(date, [...list].sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "in" ? -1 : 1)));
  return byDay;
}

/**
 * Move an anchor forward to the start of `month`, using the lines of the months in between.
 * `linesForMonth` gives the lines of any month from the anchor's month up to the one before `month`.
 */
export function carryAnchor(anchor: BalanceAnchor, month: string, linesForMonth: (m: string) => AccountLine[]): BalanceAnchor {
  const monthStart = `${month}-01`;
  if (anchor.date >= monthStart) return anchor;
  let balance = anchor.balance;
  let cursor = anchor.date.slice(0, 7);
  for (let guard = 0; cursor < month && guard < 36; guard += 1) {
    for (const [date, list] of linesByDay(cursor, linesForMonth(cursor))) {
      if (date < anchor.date) continue;
      if (anchor.mode === "end" && date === anchor.date) continue;
      balance += list.reduce((s, l) => s + signed(l), 0);
    }
    const [y, m] = cursor.split("-").map(Number);
    cursor = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return { date: monthStart, balance: r2(balance), mode: "start" };
}

/** Move a checked ("end") balance from after `month` back to the end of `month`. */
export function carryBackAnchor(anchor: BalanceAnchor, month: string, linesForMonth: (m: string) => AccountLine[]): BalanceAnchor {
  const days = daysOf(month);
  const monthEnd = days[days.length - 1];
  if (anchor.date <= monthEnd || anchor.mode !== "end") return anchor;
  let balance = anchor.balance;
  let [y, m] = month.split("-").map(Number);
  for (let guard = 0; guard < 36; guard += 1) {
    if (m === 12) { y += 1; m = 1; } else m += 1;
    const cursor = `${y}-${String(m).padStart(2, "0")}`;
    if (`${cursor}-01` > anchor.date) break;
    for (const [date, list] of linesByDay(cursor, linesForMonth(cursor))) {
      if (date > anchor.date) continue;
      balance -= list.reduce((s, l) => s + signed(l), 0);
    }
  }
  return { date: monthEnd, balance: r2(balance), mode: "end" };
}

export function balanceTimeline({ month, anchor, lines, today }: {
  month: string;
  anchor: BalanceAnchor;
  lines: AccountLine[];
  today: string;
}): BalanceTimeline {
  const days = daysOf(month);
  const first = days[0];
  const last = days[days.length - 1];
  const byDay = linesByDay(month, lines);
  const net = (date: string) => (byDay.get(date) || []).reduce((s, l) => s + signed(l), 0);

  // Start-of-day balances (null = unknown).
  const start: Record<string, number | null> = Object.fromEntries(days.map((d) => [d, null]));
  if (anchor.mode === "start") {
    if (anchor.date <= last) {
      const from = anchor.date < first ? first : anchor.date;
      let running = anchor.balance;
      for (const d of days) {
        if (d < from) continue;
        start[d] = running;
        running += net(d);
      }
    }
  } else {
    // A checked balance: pinned to the end of its day (clamped into the month), worked both ways.
    const pin = anchor.date < first ? first : anchor.date > last ? last : anchor.date;
    const pi = days.indexOf(pin);
    start[pin] = (anchor.date < first ? anchor.balance : anchor.balance - net(pin));
    if (anchor.date < first) start[pin] = anchor.balance;
    for (let i = pi + 1; i < days.length; i += 1) start[days[i]] = (start[days[i - 1]] as number) + net(days[i - 1]);
    for (let i = pi - 1; i >= 0; i -= 1) start[days[i]] = (start[days[i + 1]] as number) - net(days[i]);
  }

  const out: BalanceDay[] = days.map((date) => {
    const s = start[date];
    let running = s;
    const dayLines = (byDay.get(date) || []).map((line) => {
      if (running == null) return { ...line, after: null };
      running += signed(line);
      return { ...line, after: r2(running) };
    });
    return { date, balance: s == null ? null : r2(s + net(date)), lines: dayLines };
  });

  const knownFrom = out.find((d) => d.balance != null)?.date ?? null;
  const from = today >= first && today <= last ? today : first;
  let low: BalanceTimeline["low"] = null;
  for (const day of out) {
    const s = start[day.date];
    if (day.date < from || s == null) continue;
    if (!low || s < low.balance) low = { balance: r2(s), date: day.date, line: null };
    for (const line of day.lines) if (line.after != null && line.after < low.balance) low = { balance: line.after, date: day.date, line };
  }

  return {
    days: out,
    anchor,
    knownFrom,
    low,
    end: out[out.length - 1]?.balance ?? null,
    today: today >= first && today <= last ? out.find((d) => d.date === today)?.balance ?? null : null,
  };
}
