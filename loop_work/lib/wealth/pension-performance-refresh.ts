import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { evidencePlanningRate } from "@/lib/retirement/automatic-assumptions";

type AdminClient = ReturnType<typeof createAdminClient>;
type SharedSnapshot = { glossary_id: string | null; isin: string | null; point_date: string; unit_price_gbp: number; source: string | null; source_url: string | null; parse_confidence: string | null };
type Fund = { id: string; user_id: string; pension_account_id: string; fund_name: string; current_value: number | null; unit_price: number | null; price_as_of_date: string | null; glossary_id: string | null; underlying_isin: string | null };

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseIsin(value: string | null) { return String(value || "").trim().toUpperCase(); }
function trustedSnapshot(row: SharedSnapshot, fund: Fund) {
  const fundIsin = normaliseIsin(fund.underlying_isin);
  const snapshotIsin = normaliseIsin(row.isin);
  if (!fund.glossary_id || !fundIsin || fundIsin !== snapshotIsin || !row.source_url) return false;
  try { return new URL(row.source_url).protocol === "https:"; } catch { return false; }
}

function annualisedReturn(latest: { date: Date; price: number }, history: Array<{ date: Date; price: number }>, years: number) {
  const target = new Date(latest.date);
  target.setUTCFullYear(target.getUTCFullYear() - years);
  const candidates = history.filter((row) => row.date <= latest.date && row.price > 0);
  if (!candidates.length) return null;
  const closest = candidates.reduce((best, row) => Math.abs(row.date.getTime() - target.getTime()) < Math.abs(best.date.getTime() - target.getTime()) ? row : best);
  const observedYears = (latest.date.getTime() - closest.date.getTime()) / (365.2425 * 86400000);
  if (observedYears < years * 0.8 || observedYears > years * 1.2 || closest.price <= 0 || latest.price <= 0) return null;
  return (Math.pow(latest.price / closest.price, 1 / observedYears) - 1) * 100;
}

export async function refreshPensionPerformanceAssumptions(supabase: AdminClient = createAdminClient()) {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 11);
  const [{ data: funds, error: fundError }, { data: sharedSnapshots, error: sharedSnapshotError }] = await Promise.all([
    supabase.from("pension_funds").select("id,user_id,pension_account_id,fund_name,current_value,unit_price,price_as_of_date,glossary_id,underlying_isin").returns<Fund[]>(),
    supabase.from("pension_fund_price_snapshots").select("glossary_id,isin,point_date,unit_price_gbp,source,source_url,parse_confidence").gte("point_date", cutoff.toISOString().slice(0, 10)).order("point_date", { ascending: true }).returns<SharedSnapshot[]>(),
  ]);
  if (fundError) throw new Error(fundError.message);
  if (sharedSnapshotError) throw new Error(sharedSnapshotError.message);

  const sharedByGlossary = new Map<string, SharedSnapshot[]>();
  for (const row of sharedSnapshots || []) {
    if (!row.glossary_id) continue;
    const rows = sharedByGlossary.get(row.glossary_id) || [];
    rows.push(row);
    sharedByGlossary.set(row.glossary_id, rows);
  }

  const asOfDate = new Date().toISOString().slice(0, 10);
  const payload = (funds || []).flatMap((fund) => {
    const sharedHistory = (fund.glossary_id ? sharedByGlossary.get(fund.glossary_id) || [] : [])
      .filter(row => trustedSnapshot(row, fund))
      .map(row => ({ date: new Date(`${row.point_date}T00:00:00Z`), price: n(row.unit_price_gbp), source: row.source, sourceUrl: row.source_url, confidence: row.parse_confidence }))
      .filter(row => Number.isFinite(row.date.getTime()) && row.price > 0);
    const history = sharedHistory.map(({ date, price }) => ({ date, price }));
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
      source_name: sharedHistory.at(-1)?.source || "LOOP stored unit-price history",
      source_url: sharedHistory.at(-1)?.sourceUrl || null,
      source_kind: sharedHistory.length ? "shared_provider_unit_price_history" : "stored_unit_price_history",
      verified_at: new Date().toISOString(),
      raw_payload_hash: createHash("sha256").update(raw).digest("hex"),
      metadata: { latest_unit_price: latest.price, latest_price_date: latest.date.toISOString().slice(0, 10), observations: history.length, glossary_id: fund.glossary_id },
      updated_at: new Date().toISOString(),
    }];
  });

  if (payload.length) {
    const { error } = await supabase.from("pension_fund_performance_assumptions").upsert(payload, { onConflict: "user_id,pension_fund_id,as_of_date" });
    if (error) throw new Error(error.message);
  }
  const payloadByFund = new Map(payload.map(row => [row.pension_fund_id, row]));
  let needsReview = 0;
  let historyBuilding = 0;
  for (const fund of funds || []) {
    const evidence = payloadByFund.get(fund.id);
    const hasVerifiedIdentity = Boolean(fund.glossary_id && normaliseIsin(fund.underlying_isin));
    const status = evidence ? "evidence_ready" : hasVerifiedIdentity ? "history_building" : "needs_review";
    if (status === "needs_review") needsReview += 1;
    if (status === "history_building") historyBuilding += 1;
    const { error } = await supabase.from("pension_funds").update({
      performance_annualised_5y_percent: evidence?.annualised_5y_percent ?? null,
      performance_annualised_10y_percent: evidence?.annualised_10y_percent ?? null,
      performance_planning_rate_percent: evidence ? evidencePlanningRate(evidence.annualised_5y_percent, evidence.annualised_10y_percent) : null,
      performance_as_of_date: evidence?.as_of_date ?? null,
      performance_source_url: evidence?.source_url ?? null,
      performance_source_kind: evidence?.source_kind ?? null,
      performance_status: status,
      performance_verified_at: evidence?.verified_at ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", fund.id);
    if (error) throw new Error(error.message);
  }
  return { fundsChecked: (funds || []).length, assumptionsStored: payload.length, needsReview, historyBuilding, asOfDate };
}
