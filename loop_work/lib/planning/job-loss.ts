// "What if this job ended?" — runs the household forecast with one person's pay removed
// after the leaving month, adds the redundancy + notice lump sum, and reports how long
// savings last.

export type JobLossMonth = { month: string; leftOver: number; personPay: number };

export type JobLossResult = {
  lumpSum: number;              // after-tax redundancy + notice, paid in the leaving month
  monthlyGap: number;           // shortfall each month once pay stops (0 if the rest covers it)
  monthsCovered: number | null; // months after pay stops before money runs out; null = lasts the whole forecast
  runsOutIn: string | null;     // first month the balance goes below zero
  forecastMonths: number;       // months checked after pay stops
  path: { month: string; balance: number; leftOver: number }[];
};

export function jobLossScenario({
  months,
  savingsNow,
  endMonth,
  lumpSum,
}: {
  months: JobLossMonth[];
  savingsNow: number;
  endMonth: string;
  lumpSum: number;
}): JobLossResult {
  let balance = savingsNow;
  let runsOutIn: string | null = null;
  const path: JobLossResult["path"] = [];
  const after = months.filter((m) => m.month > endMonth);
  for (const m of months) {
    const leftOver = m.month > endMonth ? m.leftOver - m.personPay : m.leftOver;
    balance += leftOver + (m.month === endMonth ? lumpSum : 0);
    path.push({ month: m.month, balance: Math.round(balance * 100) / 100, leftOver: Math.round(leftOver * 100) / 100 });
    if (!runsOutIn && balance < 0) runsOutIn = m.month;
  }
  const gaps = after.map((m) => m.leftOver - m.personPay);
  const firstYear = gaps.slice(0, 12);
  const avg = firstYear.length ? firstYear.reduce((s, v) => s + v, 0) / firstYear.length : 0;
  const monthlyGap = avg < 0 ? Math.round(-avg * 100) / 100 : 0;
  let monthsCovered: number | null = null;
  if (runsOutIn) {
    monthsCovered = runsOutIn <= endMonth ? 0 : after.filter((m) => m.month < (runsOutIn as string)).length;
  }
  return {
    lumpSum: Math.round(lumpSum * 100) / 100,
    monthlyGap,
    monthsCovered,
    runsOutIn,
    forecastMonths: after.length,
    path,
  };
}
