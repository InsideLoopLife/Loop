// Daily health checks for Loop's automated jobs. Each check either raises an
// admin alert (loop_admin_raise_alert, deduped per check) or resolves the
// open alert once things recover, so /admin shows what actually needs a look.
import type { SupabaseClient } from "@supabase/supabase-js";

type Check = {
  key: string;
  area: string;
  title: string;
  actionUrl: string;
  run: () => Promise<{ ok: boolean; severity?: "medium" | "high" | "critical"; summary: string; payload?: Record<string, unknown> }>;
};

const hoursSince = (iso?: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Number.POSITIVE_INFINITY);
const isWeekend = () => [0, 6].includes(new Date().getUTCDay());

async function latest(db: SupabaseClient, table: string, column: string) {
  const { data, error } = await db.from(table).select(column).order(column, { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data as any)?.[column] as string | null | undefined;
}

export function buildHealthChecks(db: SupabaseClient, ratesDb: SupabaseClient | null): Check[] {
  return [
    {
      key: "boe_benchmarks_stale", area: "rates", title: "Bank Rate not updating", actionUrl: "/admin/boe-benchmarks",
      run: async () => {
        // Bank Rate is read every morning by the rates worker.
        if (!ratesDb) return { ok: true, summary: "Rates database not configured here." };
        const { data } = await ratesDb.from("mortgage_market_rate_benchmarks").select("fetched_at").eq("term_type", "bank_rate").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
        const newest = (data as any)?.fetched_at as string | undefined;
        return hoursSince(newest) < 72
          ? { ok: true, summary: `Last checked ${newest}` }
          : { ok: false, severity: "high", summary: `Bank Rate last read ${newest ? newest.slice(0, 10) : "never"}. Check the boeBenchmarks phase in the rates worker logs.` };
      },
    },
    {
      key: "boe_mortgage_averages_due", area: "rates", title: "Upload this month's Bank of England mortgage averages", actionUrl: "/admin/boe-benchmarks",
      run: async () => {
        // Published on the 5th working day for the month before, so by the 12th
        // last month's figures should be in. Uploaded by an admin (see page).
        if (!ratesDb) return { ok: true, summary: "Rates database not configured here." };
        const { data } = await ratesDb.from("mortgage_market_rate_benchmarks").select("effective_month").neq("term_type", "bank_rate").order("effective_month", { ascending: false }).limit(1).maybeSingle();
        const newest = (data as any)?.effective_month as string | undefined;
        const now = new Date();
        const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (now.getUTCDate() >= 12 ? 1 : 2), 1)).toISOString().slice(0, 10);
        return newest && newest >= expected
          ? { ok: true, summary: `Latest month ${newest.slice(0, 7)}` }
          : { ok: false, severity: "medium", summary: `Latest averages are for ${newest ? newest.slice(0, 7) : "no month yet"}. Download and upload the CSV at /admin/boe-benchmarks (about 2 minutes).` };
      },
    },
    {
      key: "investment_prices_stale", area: "investments", title: "Investment prices not updating", actionUrl: "/admin/investment-coverage",
      run: async () => {
        const newest = await latest(db, "investment_instrument_price_points", "point_at");
        const limit = isWeekend() ? 72 : 24;
        return hoursSince(newest) < limit ? { ok: true, summary: `Last price ${newest}` } : { ok: false, severity: "high", summary: `No new prices since ${newest || "ever"}. Check the market-data worker on Render.` };
      },
    },
    {
      key: "pension_prices_stale", area: "investments", title: "Pension fund prices not updating", actionUrl: "/admin/investments",
      run: async () => {
        const newest = await latest(db, "pension_fund_price_snapshots", "point_date");
        return hoursSince(newest) < 24 * 7 ? { ok: true, summary: `Last price ${newest}` } : { ok: false, severity: "medium", summary: `No pension price saved since ${newest || "ever"}. Check pensions-daily for funds needing review.` };
      },
    },
    {
      key: "mortgage_watch_stale", area: "mortgage", title: "Mortgage renewal watch not running", actionUrl: "/admin/houses",
      run: async () => {
        const { data } = await db.from("mortgage_renewal_watch_runs").select("started_at, status, error").order("started_at", { ascending: false }).limit(1).maybeSingle();
        if (!data || hoursSince((data as any).started_at) > 36) return { ok: false, severity: "medium", summary: `Last run ${(data as any)?.started_at || "never"}.` };
        if ((data as any).status === "failed") return { ok: false, severity: "high", summary: `Last run failed: ${(data as any).error || "unknown error"}` };
        return { ok: true, summary: "Ran in the last 36 hours." };
      },
    },
    {
      key: "briefing_stale", area: "briefing", title: "Daily financial briefing not generated", actionUrl: "/admin",
      run: async () => {
        const newest = await latest(db, "financial_briefings", "briefing_date");
        return hoursSince(newest) < 48 ? { ok: true, summary: `Latest ${newest}` } : { ok: false, severity: "medium", summary: `Latest briefing is from ${newest || "never"}.` };
      },
    },
    {
      key: "calendar_stale", area: "calendar", title: "Calendar not being filled", actionUrl: "/admin",
      run: async () => {
        const { count } = await db.from("planned_items").select("id", { count: "exact", head: true });
        if (!count) return { ok: true, summary: "No bills yet, nothing to fill." };
        const { data } = await db.from("calendar_events").select("updated_at").in("source", ["loop_payment", "loop_income"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        const newest = (data as any)?.updated_at;
        return hoursSince(newest) < 36 ? { ok: true, summary: `Last filled ${newest}` } : { ok: false, severity: "medium", summary: `Calendar last filled ${newest || "never"}. Check /api/cron/calendar-sync in the rates worker run.` };
      },
    },
    {
      key: "council_tax_rates_missing", area: "property", title: "Council tax rates not loaded for this year", actionUrl: "/admin/property-sources",
      run: async () => {
        const { ENGLAND_TABLE } = await import("@/lib/property/council-tax-rates");
        const { count } = await db.from("loop_council_tax_rate_estimates").select("id", { count: "exact", head: true })
          .eq("country_code", "ENG").eq("band", "D").eq("charge_year", ENGLAND_TABLE.chargeYear);
        return (count || 0) >= 250
          ? { ok: true, summary: `${count} councils loaded for ${ENGLAND_TABLE.chargeYear}.` }
          : { ok: false, severity: "medium", summary: `Only ${count || 0} councils loaded for ${ENGLAND_TABLE.chargeYear}. Check /api/cron/council-tax-refresh, and update ENGLAND_TABLE in lib/property/council-tax-rates.ts each April.` };
      },
    },
    {
      key: "retirement_refresh_failing", area: "retirement", title: "Retirement assumptions refresh failing", actionUrl: "/admin",
      run: async () => {
        const { data } = await db.from("retirement_assumption_refresh_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
        const status = String((data as any)?.status || "");
        return !data || status === "failed" ? { ok: false, severity: "medium", summary: `Latest run: ${status || "none"}` } : { ok: true, summary: `Latest run: ${status}` };
      },
    },
  ];
}

export async function runHealthChecks(db: SupabaseClient, ratesDb: SupabaseClient | null) {
  const results: Array<{ key: string; ok: boolean; summary: string }> = [];
  for (const check of buildHealthChecks(db, ratesDb)) {
    let outcome: Awaited<ReturnType<Check["run"]>>;
    try {
      outcome = await check.run();
    } catch (error: any) {
      outcome = { ok: false, severity: "medium", summary: `Health check could not run: ${error?.message || "error"}` };
    }
    const dedupe = `${check.area}:${check.key}::`;
    if (outcome.ok) {
      await db.from("loop_admin_alerts")
        .update({ status: "resolved", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("dedupe_key", dedupe)
        .in("status", ["open", "watching", "needs_admin_review", "in_progress"]);
    } else {
      await db.rpc("loop_admin_raise_alert", {
        p_area: check.area,
        p_severity: outcome.severity || "medium",
        p_alert_key: check.key,
        p_title: check.title,
        p_summary: outcome.summary,
        p_action_url: check.actionUrl,
        p_payload: outcome.payload || {},
        p_check_cadence_minutes: 1440,
      });
    }
    results.push({ key: check.key, ok: outcome.ok, summary: outcome.summary });
  }
  return results;
}
