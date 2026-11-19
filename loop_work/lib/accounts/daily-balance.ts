// An account's balance day by day through a month, worked out from its last checked balance and the
// lines that move money in and out. The checked balance is taken to include everything dated on or
// before the day it was checked; later lines are added, earlier ones are taken back off.
import type { AccountLine } from "@/lib/accounts/account-activity";

export type BalanceDay = { date: string; balance: number; lines: Array<AccountLine & { after: number }> };
export type BalanceTimeline = {
  days: BalanceDay[];
  /** The day the checked balance is pinned to, inside this month. */
  anchor: string;
  /** Line key → balance straight after it. */
  after: Record<string, number>;
  low: { balance: number; date: string; line: AccountLine | null } | null;
  end: number;
  today: number | null;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

function daysOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function balanceTimeline({ month, balance, checkedAt, lines, today }: {
  month: string;
  balance: number;
  checkedAt: string | null;
  lines: AccountLine[];
  today: string;
}): BalanceTimeline {
  const days = daysOf(month);
  const first = days[0];
  const last = days[days.length - 1];
  const checked = (checkedAt || today).slice(0, 10);
  const anchor = checked < first ? first : checked > last ? last : checked;
  // Checked before this month began: the checked balance is the opening balance (nothing earlier is known).
  const openingFromCheck = checked < first;

  const byDay = new Map<string, AccountLine[]>();
  for (const line of lines) {
    const date = line.date && line.date >= first && line.date <= last ? line.date : first;
    byDay.set(date, [...(byDay.get(date) || []), line]);
  }
  const net = (date: string) => (byDay.get(date) || []).reduce((s, l) => s + (l.direction === "in" ? l.amount : -l.amount), 0);

  // End-of-day balances.
  const end: Record<string, number> = {};
  const ai = days.indexOf(anchor);
  end[anchor] = openingFromCheck ? balance + net(anchor) : balance;
  for (let i = ai + 1; i < days.length; i += 1) end[days[i]] = end[days[i - 1]] + net(days[i]);
  for (let i = ai - 1; i >= 0; i -= 1) end[days[i]] = end[days[i + 1]] - net(days[i + 1]);

  const after: Record<string, number> = {};
  const out: BalanceDay[] = days.map((date, i) => {
    let running = i === 0 ? end[date] - net(date) : end[days[i - 1]];
    const dayLines = (byDay.get(date) || []).map((line) => {
      running += line.direction === "in" ? line.amount : -line.amount;
      after[line.key] = r2(running);
      return { ...line, after: r2(running) };
    });
    return { date, balance: r2(end[date]), lines: dayLines };
  });

  // Lowest point from today on (or across the month when it isn't the current one), line by line.
  const from = today >= first && today <= last ? today : first;
  let low: BalanceTimeline["low"] = null;
  for (const day of out) {
    if (day.date < from) continue;
    const startOfDay = day.balance - day.lines.reduce((s, l) => s + (l.direction === "in" ? l.amount : -l.amount), 0);
    if (!low || startOfDay < low.balance) low = { balance: r2(startOfDay), date: day.date, line: null };
    for (const line of day.lines) if (line.after < low.balance) low = { balance: line.after, date: day.date, line };
  }

  return {
    days: out,
    anchor,
    after,
    low,
    end: out[out.length - 1]?.balance ?? r2(balance),
    today: today >= first && today <= last ? out.find((d) => d.date === today)?.balance ?? null : null,
  };
}
