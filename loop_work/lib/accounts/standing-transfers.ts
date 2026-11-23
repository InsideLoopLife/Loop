// Regular transfers one person makes into another account (usually a joint account):
// "Dan moves £150 into Joint every Friday". Pure date maths, shared by the server and the client.
// Like a standing order, a transfer due on a weekend or bank holiday goes on the next working day.
import { adjustedWorkday } from "@/lib/planning/summary-plan";

export type TransferFrequency = "weekly" | "fortnightly" | "four_weekly" | "monthly";

export type StandingTransfer = {
  id: string;
  person_id: string | null;
  from_account_id: string | null;
  to_account_id: string;
  amount: number;
  frequency: TransferFrequency;
  weekday: number | null; // ISO: 1 = Monday … 7 = Sunday
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  note: string | null;
};

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DAY_MS = 86_400_000;

function utc(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function iso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function isoWeekday(ms: number) {
  const day = new Date(ms).getUTCDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function previousMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextWorkingDay(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const moved = adjustedWorkday(new Date(y, m - 1, d), "next_workday");
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, "0")}-${String(moved.getDate()).padStart(2, "0")}`;
}

/** Dates (YYYY-MM-DD) the transfer actually lands on within a month, after moving off weekends and bank holidays. */
export function transferDatesInMonth(transfer: Pick<StandingTransfer, "frequency" | "weekday" | "day_of_month" | "start_date" | "end_date">, month: string): string[] {
  const shifted = [...scheduledDatesInMonth(transfer, previousMonth(month)), ...scheduledDatesInMonth(transfer, month)]
    .map(nextWorkingDay)
    .filter((date) => date.startsWith(month));
  return [...new Set(shifted)].sort();
}

/** The scheduled dates before any working-day adjustment. */
export function scheduledDatesInMonth(transfer: Pick<StandingTransfer, "frequency" | "weekday" | "day_of_month" | "start_date" | "end_date">, month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const monthStart = Date.UTC(y, m - 1, 1);
  const monthEnd = Date.UTC(y, m, 0);
  const start = utc(transfer.start_date);
  const end = transfer.end_date ? utc(transfer.end_date) : Infinity;
  const from = Math.max(monthStart, start);
  const to = Math.min(monthEnd, end);
  if (from > to) return [];

  if (transfer.frequency === "monthly") {
    const lastDay = new Date(monthEnd).getUTCDate();
    const day = Math.min(lastDay, Math.max(1, Number(transfer.day_of_month || 1)));
    const date = Date.UTC(y, m - 1, day);
    return date >= from && date <= to ? [iso(date)] : [];
  }

  const weekday = Math.min(7, Math.max(1, Number(transfer.weekday || 1)));
  const step = transfer.frequency === "weekly" ? 7 : transfer.frequency === "fortnightly" ? 14 : 28;
  // First occurrence: the first chosen weekday on or after the start date; later ones step from there.
  let first = start;
  while (isoWeekday(first) !== weekday) first += DAY_MS;
  let date = first;
  if (date < from) date += Math.ceil((from - date) / (step * DAY_MS)) * step * DAY_MS;
  const dates: string[] = [];
  for (; date <= to; date += step * DAY_MS) dates.push(iso(date));
  return dates;
}

export function transferAmountInMonth(transfer: StandingTransfer, month: string) {
  return Math.round(transferDatesInMonth(transfer, month).length * Number(transfer.amount || 0) * 100) / 100;
}

/** Typical month: weekly × 52 / 12, fortnightly × 26 / 12, four-weekly × 13 / 12. */
export function transferMonthlyAverage(transfer: Pick<StandingTransfer, "amount" | "frequency">) {
  const amount = Number(transfer.amount || 0);
  const perYear = transfer.frequency === "weekly" ? 52 : transfer.frequency === "fortnightly" ? 26 : transfer.frequency === "four_weekly" ? 13 : 12;
  return Math.round((amount * perYear / 12) * 100) / 100;
}

export function transferScheduleLabel(transfer: Pick<StandingTransfer, "frequency" | "weekday" | "day_of_month">) {
  const day = WEEKDAYS[Math.min(7, Math.max(1, Number(transfer.weekday || 1))) - 1];
  if (transfer.frequency === "weekly") return `every ${day}`;
  if (transfer.frequency === "fortnightly") return `every other ${day}`;
  if (transfer.frequency === "four_weekly") return `every 4 weeks on a ${day}`;
  return `on the ${ordinal(Number(transfer.day_of_month || 1))} of each month`;
}

export function shortDate(isoDate: string) {
  const d = new Date(utc(isoDate));
  return `${WEEKDAYS[isoWeekday(d.getTime()) - 1].slice(0, 3)} ${d.getUTCDate()}`;
}
