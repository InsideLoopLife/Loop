import { createAdminClient } from "@/lib/supabase/admin";

const ONS_CPIH_PAGE = "https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/l522/mm23";
const ONS_CPIH_CSV = `https://www.ons.gov.uk/generator?format=csv&uri=${new URL(ONS_CPIH_PAGE).pathname}`;

function annualRows(csv: string) {
  const rows: Array<{ year: number; value: number }> = [];
  for (const line of csv.split(/\r?\n/)) {
    const cells = line.split(",").map(cell => cell.trim().replace(/^"|"$/g, ""));
    const yearIndex = cells.findIndex(cell => /^\d{4}$/.test(cell));
    if (yearIndex < 0) continue;
    const value = Number(cells.slice(yearIndex + 1).find(cell => /^-?\d+(\.\d+)?$/.test(cell)));
    if (Number.isFinite(value) && value > 0) rows.push({ year: Number(cells[yearIndex]), value });
  }
  return rows.sort((a,b)=>a.year-b.year);
}

export async function refreshPrevailingInflation(supabase = createAdminClient(), options: { force?: boolean; now?: Date } = {}) {
  const now = options.now || new Date();
  const { data: existing, error: existingError } = await supabase.from("retirement_economic_assumptions").select("annualised_rate_percent,start_date,end_date,verified_at").eq("assumption_key", "uk_cpih_prevailing_10y").order("end_date", { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const verifiedAt = existing?.verified_at ? Date.parse(existing.verified_at) : NaN;
  if (!options.force && Number.isFinite(verifiedAt) && now.getTime() - verifiedAt < 25 * 86400000) {
    return { skipped: true, annualisedRatePercent: Number(existing?.annualised_rate_percent), startYear: Number(String(existing?.start_date).slice(0,4)), endYear: Number(String(existing?.end_date).slice(0,4)) };
  }
  const response = await fetch(ONS_CPIH_CSV, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!response.ok) throw new Error(`ONS CPIH download failed (${response.status})`);
  const rows = annualRows(await response.text());
  const latest = rows.at(-1);
  const start = latest && rows.find(row => row.year === latest.year - 10);
  if (!latest || !start) throw new Error("ONS CPIH data did not contain a complete 10-year annual series");
  const annualisedRate = (Math.pow(latest.value / start.value, 1 / 10) - 1) * 100;
  const payload = {
    assumption_key: "uk_cpih_prevailing_10y", annualised_rate_percent: annualisedRate, period_years: 10,
    start_date: `${start.year}-12-31`, end_date: `${latest.year}-12-31`, start_value: start.value, end_value: latest.value,
    source_name: "Office for National Statistics · CPIH all items", source_url: ONS_CPIH_PAGE, source_kind: "official_statistics",
    verified_at: now.toISOString(), metadata: { series: "L522", dataset: "MM23", calculation: "compound annual growth rate", observations: rows.length },
  };
  const { error } = await supabase.from("retirement_economic_assumptions").upsert(payload, { onConflict: "assumption_key,end_date" });
  if (error) throw new Error(error.message);
  return { skipped: false, annualisedRatePercent: annualisedRate, startYear: start.year, endYear: latest.year };
}
