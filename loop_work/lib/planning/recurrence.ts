// Month-stepped recurrences (quarterly, yearly) for planned items. Monthly,
// one-off and day-interval items keep their existing handling; every page's
// date logic calls this first so a yearly bill lands only in its own month.

export function monthStepFor(recurrence?: string | null): number | null {
  const r = String(recurrence || "");
  if (r === "quarterly") return 3;
  if (r === "annual" || r === "annually" || r === "yearly") return 12;
  return null;
}

/** The due date in `month` ("YYYY-MM") for a quarterly/yearly item, or null if it doesn't fall due then. */
export function monthSteppedDate(item: { recurrence?: string | null; start_date?: string | null; end_date?: string | null; day_of_month?: number | null }, month: string): string | null {
  const step = monthStepFor(item.recurrence);
  if (!step || !item.start_date) return null;
  const [sy, sm] = item.start_date.slice(0, 7).split("-").map(Number);
  const [y, m] = month.split("-").map(Number);
  const diff = (y - sy) * 12 + (m - sm);
  if (diff < 0 || diff % step !== 0) return null;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Number(item.day_of_month || item.start_date.slice(8, 10)) || 1, daysInMonth);
  const date = `${month}-${String(day).padStart(2, "0")}`;
  if (item.end_date && date > item.end_date) return null;
  return date;
}

export const RECURRENCE_LABELS: Record<string, string> = { quarterly: "Every 3 months", annual: "Once a year" };
