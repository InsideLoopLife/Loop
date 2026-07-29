export function currentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthKey(value?: string | null, now = new Date()) {
  const monthKey = /^\d{4}-\d{2}$/.test(String(value || "")) ? String(value) : currentMonthKey(now);
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { monthKey, year, month, start, end, startIso: isoDate(start), endIso: isoDate(end) };
}

export function addMonths(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return currentMonthKey(date);
}

export function monthCarousel(monthKey: string) {
  return [addMonths(monthKey, -1), monthKey, addMonths(monthKey, 1)];
}

export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
