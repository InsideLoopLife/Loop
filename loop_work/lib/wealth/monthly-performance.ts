function n(value: unknown) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

type SnapshotRow = { value: number | null; snapshot_date: string };

function summarisePerformance<T extends SnapshotRow>(rows: T[], idKey: keyof T, monthStartDate: string) {
  const byId = new Map<string, T[]>();
  for (const row of rows) {
    const key = String(row[idKey]);
    const list = byId.get(key) || [];
    list.push(row);
    byId.set(key, list);
  }

  let baselineTotal = 0;
  let currentTotal = 0;
  let itemsWithBaseline = 0;

  for (const [, list] of byId) {
    const sorted = list.slice().sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const current = sorted[sorted.length - 1];
    // Baseline = last snapshot on/before the 1st of this month. If there isn't one (the holding is
    // newer than this month), fall back to its earliest snapshot so "performance" reads as flat
    // rather than falsely showing a huge gain from zero.
    const beforeMonth = sorted.filter((row) => row.snapshot_date <= monthStartDate);
    const baseline = beforeMonth.length ? beforeMonth[beforeMonth.length - 1] : sorted[0];
    if (beforeMonth.length) itemsWithBaseline += 1;
    currentTotal += n(current?.value);
    baselineTotal += n(baseline?.value);
  }

  const changeAmount = currentTotal - baselineTotal;
  const changePercent = baselineTotal > 0 ? (changeAmount / baselineTotal) * 100 : 0;

  return {
    baselineTotal,
    currentTotal,
    changeAmount,
    changePercent,
    hasData: byId.size > 0,
    // True once at least one tracked holding/fund actually has a snapshot from before this month,
    // so the UI can distinguish "flat because nothing changed" from "flat because we have no history yet".
    hasBaseline: itemsWithBaseline > 0,
  };
}

export type MonthlyPerformanceSide = ReturnType<typeof summarisePerformance>;

export async function buildMonthlyInvestmentPensionPerformance(supabase: any, userIds: string[], month: string) {
  const monthStartDate = `${month}-01`;

  const [investmentSnapshots, pensionSnapshots] = await Promise.all([
    supabase
      .from("investment_price_snapshots")
      .select("holding_id, value, snapshot_date")
      .in("user_id", userIds)
      .order("snapshot_date", { ascending: true }),
    supabase
      .from("pension_fund_value_snapshots")
      .select("pension_fund_id, value, snapshot_date")
      .in("user_id", userIds)
      .order("snapshot_date", { ascending: true }),
  ]);

  const investments = summarisePerformance((investmentSnapshots.data || []) as SnapshotRow[], "holding_id" as any, monthStartDate);
  const pensions = summarisePerformance((pensionSnapshots.data || []) as SnapshotRow[], "pension_fund_id" as any, monthStartDate);

  return { investments, pensions };
}
