import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;
type Snapshot = { pension_fund_id: string; snapshot_date: string; unit_price: number | null };
type Fund = { id: string; user_id: string; pension_account_id: string; fund_name: string; current_value: number | null; unit_price: number | null; price_as_of_date: string | null };

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function annualisedReturn(latest: { date: Date; price: number }, history: Array<{ date: Date; price: number }>, years: number) {
  const target = new Date(latest.date);
  target.setUTCFullYear(target.getUTCFullYear() - years);
  const candidates = history.filter((row) => row.date <= latest.date && row.price > 0);
  if (!candidates.length) return null;
  const closest = candidates.reduce((best, row) => Math.abs(row.date.getTime() - target.getTime()) < Math.abs(best.date.getTime() - target.getTime()) ? row : best);
  const observedYears = (latest.date.getTime() - closest.date.getTime()) / (365.2425 * 86400000);
  if (observedYears < years * 0.8 || closest.price <= 0 || latest.price <= 0) return null;
  return (Math.pow(latest.price / closest.price, 1 / observedYears) - 1) * 100;
}

export async function refreshPensionPerformanceAssumptions(supabase: AdminClient = createAdminClient()) {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 11);
  const [{ data: funds, error: fundError }, { data: snapshots, error: snapshotError }] = await Promise.all([
    supabase.from("pension_funds").select("id,user_id,pension_account_id,fund_name,current_value,unit_price,price_as_of_date").returns<Fund[]>(),
    supabase.from("pension_fund_value_snapshots").select("pension_fund_id,snapshot_date,unit_price").gte("snapshot_date", cutoff.toISOString().slice(0, 10)).order("snapshot_date", { ascending: true }).returns<Snapshot[]>(),
  ]);
  if (fundError) throw new Error(fundError.message);
  if (snapshotError) throw new Error(snapshotError.message);

  const snapshotsByFund = new Map<string, Array<{ date: Date; price: number }>>();
  for (const row of snapshots || []) {
    const date = new Date(`${row.snapshot_date}T00:00:00Z`);
    const price = n(row.unit_price);
    if (!Number.isFinite(date.getTime()) || price <= 0) continue;
    const rows = snapshotsByFund.get(row.pension_fund_id) || [];
    rows.push({ date, price });
    snapshotsByFund.set(row.pension_fund_id, rows);
  }

  const asOfDate = new Date().toISOString().slice(0, 10);
  const payload = (funds || []).flatMap((fund) => {
    const history = snapshotsByFund.get(fund.id) || [];
    const currentPrice = n(fund.unit_price);
    const currentDate = new Date(`${fund.price_as_of_date || asOfDate}T00:00:00Z`);
    if (currentPrice > 0) history.push({ date: currentDate, price: currentPrice });
    history.sort((a, b) => a.date.getTime() - b.date.getTime());
    const latest = history.at(-1);
    if (!latest) return [];
    const five = annualisedReturn(latest, history, 5);
    const ten = annualisedReturn(latest, history, 10);
    if (five == null && ten == null) return [];
    const values = [five, ten].filter((value): value is number => value != null && Number.isFinite(value));
    const low = Math.min(...values);
    const high = Math.max(...values);
    const middle = values.reduce((sum, value) => sum + value, 0) / values.length;
    const raw = JSON.stringify({ fundId: fund.id, five, ten, latestPrice: latest.price, latestDate: latest.date.toISOString().slice(0, 10) });
    return [{
      user_id: fund.user_id,
      pension_account_id: fund.pension_account_id,
      pension_fund_id: fund.id,
      fund_name: fund.fund_name,
      current_value: n(fund.current_value),
      annualised_5y_percent: five,
      annualised_10y_percent: ten,
      low_percent: low,
      middle_percent: middle,
      high_percent: high,
      as_of_date: asOfDate,
      source_name: "LOOP stored unit-price history",
      source_kind: "stored_unit_price_history",
      verified_at: new Date().toISOString(),
      raw_payload_hash: createHash("sha256").update(raw).digest("hex"),
      metadata: { latest_unit_price: latest.price, latest_price_date: latest.date.toISOString().slice(0, 10), observations: history.length },
      updated_at: new Date().toISOString(),
    }];
  });

  if (payload.length) {
    const { error } = await supabase.from("pension_fund_performance_assumptions").upsert(payload, { onConflict: "user_id,pension_fund_id,as_of_date" });
    if (error) throw new Error(error.message);
  }
  return { fundsChecked: (funds || []).length, assumptionsStored: payload.length, asOfDate };
}
