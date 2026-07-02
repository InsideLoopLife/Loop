import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Database, HardDrive, LineChart, ShieldAlert, Trash2 } from "lucide-react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AutoRefreshClient } from "@/components/admin/AutoRefreshClient";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { loadInvestmentSnapshotSettings } from "@/lib/investments/snapshot-settings";
import { aiGuardrailEnvSummary } from "@/lib/ai/usage";
import { pruneInvestmentSnapshotsNow, saveInvestmentSnapshotSettings } from "./actions";

function inputClass() {
  return "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2";
}

function fmtBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function fmtNumber(value: any) {
  return Number(value || 0).toLocaleString("en-GB");
}

async function getRecentPricePoints(supabase: any) {
  try {
    const response = await supabase
      .from("investment_instrument_price_points")
      .select("point_at, source, ticker, exchange_code, price_gbp, gbp_price, native_price, native_currency, quote_unit, bucket_interval")
      .order("point_at", { ascending: false })
      .limit(16);
    return response.data || [];
  } catch {
    return [];
  }
}


async function getAiUsageSummary(supabase: any) {
  const fallback = {
    events24h: 0,
    events7d: 0,
    input24h: 0,
    output24h: 0,
    total24h: 0,
    input7d: 0,
    output7d: 0,
    total7d: 0,
    webSearch24h: 0,
    webSearch7d: 0,
    estimatedCost24h: 0,
    estimatedCost7d: 0,
    recent: [] as any[],
    byScope: [] as any[],
  };
  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("loop_ai_usage_events")
      .select("created_at,provider,model,scope,component,input_tokens,output_tokens,total_tokens,web_search_tool_calls,used_web_search,estimated_cost_gbp")
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return fallback;
    const rows = data || [];
    const rows24 = rows.filter((row: any) => String(row.created_at || "") >= since24h);
    const sum = (arr: any[], key: string) => arr.reduce((total, row) => total + Number(row[key] || 0), 0);
    const scopes = new Map<string, any>();
    for (const row of rows) {
      const key = String(row.scope || "unknown");
      const current = scopes.get(key) || { scope: key, events: 0, input: 0, output: 0, total: 0, webSearch: 0, cost: 0 };
      current.events += 1;
      current.input += Number(row.input_tokens || 0);
      current.output += Number(row.output_tokens || 0);
      current.total += Number(row.total_tokens || 0);
      current.webSearch += Number(row.web_search_tool_calls || 0);
      current.cost += Number(row.estimated_cost_gbp || 0);
      scopes.set(key, current);
    }
    return {
      ...fallback,
      events24h: rows24.length,
      events7d: rows.length,
      input24h: sum(rows24, "input_tokens"),
      output24h: sum(rows24, "output_tokens"),
      total24h: sum(rows24, "total_tokens"),
      input7d: sum(rows, "input_tokens"),
      output7d: sum(rows, "output_tokens"),
      total7d: sum(rows, "total_tokens"),
      webSearch24h: sum(rows24, "web_search_tool_calls"),
      webSearch7d: sum(rows, "web_search_tool_calls"),
      estimatedCost24h: sum(rows24, "estimated_cost_gbp"),
      estimatedCost7d: sum(rows, "estimated_cost_gbp"),
      recent: rows.slice(0, 12),
      byScope: Array.from(scopes.values()).sort((a, b) => b.total - a.total),
    };
  } catch {
    return fallback;
  }
}

async function getStorageUsage(supabase: any) {
  const fallback = { rows: 0, holdings: 0, users: 0, totalBytes: 0, tableBytes: 0, indexBytes: 0, newest: null as string | null, oldest: null as string | null, avgRowsPerHolding: 0, estimate: true };
  try {
    const { data, error } = await supabase.rpc("loop_admin_investment_price_point_usage");
    if (!error && data) return { ...fallback, ...(Array.isArray(data) ? data[0] : data), estimate: false };
  } catch {}

  try {
    const { count } = await supabase.from("investment_instrument_price_points").select("*", { count: "exact", head: true });
    const { data } = await supabase.from("investment_instrument_price_points").select("ticker, exchange_code, point_at").order("point_at", { ascending: false }).limit(5000);
    const rows = count || 0;
    const users = 0;
    const holdings = new Set((data || []).map((row: any) => `${row.ticker}|${row.exchange_code}`).filter(Boolean)).size;
    const newest = data?.[0]?.point_at || null;
    const oldest = data?.[data.length - 1]?.point_at || null;
    return { ...fallback, rows, users, holdings, newest, oldest, avgRowsPerHolding: holdings ? rows / holdings : 0, totalBytes: rows * 220, tableBytes: rows * 150, indexBytes: rows * 70, estimate: true };
  } catch {
    return fallback;
  }
}

export default async function InvestmentStorageAdminPage() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/investment-storage")}`);

  if (!access.isAdmin) {
    return <main className="mx-auto max-w-4xl px-4 py-10 md:px-6"><section className="rounded-[2rem] border border-red-100 bg-red-50 p-8"><div className="flex items-start gap-4"><ShieldAlert className="h-7 w-7 text-red-700" /><div><h1 className="text-2xl font-black text-red-950">Admin access is not enabled</h1><p className="mt-2 text-sm font-bold text-red-700">You are signed in as {access.user.email || "unknown email"}.</p></div></div></section></main>;
  }

  const supabase = createBestAdminClient() || await createClient();
  const [settings, usage, recent, aiUsage] = await Promise.all([
    loadInvestmentSnapshotSettings(supabase),
    getStorageUsage(supabase),
    getRecentPricePoints(supabase),
    getAiUsageSummary(supabase),
  ]);
  const aiEnv = aiGuardrailEnvSummary();

  const manualVsStored = settings.enabled
    ? `Raw share-price points are saved once per ticker/exchange, then each user chart multiplies that shared price by their own units. Realtime users can trigger 1-minute points; Plus/Pro 15-minute points; free users 30-minute points.`
    : "Automatic point storage is off; charts can still use live/current values and delayed generated history where available.";

  return (
    <>
      <AutoRefreshClient intervalMs={30000} />
      <main className="mx-auto w-[95vw] max-w-none space-y-8 px-4 py-8 md:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80"><HardDrive className="h-4 w-4" /> Investment storage</div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Chart point storage settings</h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-white/72">Control whether InsideLoop saves global raw share-price points, how often each tier can trigger refreshes, how the shared price table is compacted, and what that costs in database usage.</p>
          </div>
          <Link href="/admin" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">Back to admin</Link>
        </div>
      </section>

      <AdminTabs />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Stored raw price points" value={fmtNumber(usage.rows)} helper="investment_instrument_price_points" />
        <StatCard title="Database usage" value={fmtBytes(Number(usage.totalBytes || usage.total_bytes || 0))} helper={usage.estimate ? "estimated" : "actual table + index"} />
        <StatCard title="Tickers covered" value={fmtNumber(usage.holdings)} helper={`${Number(usage.avgRowsPerHolding || usage.avg_rows_per_holding || 0).toFixed(1)} avg points`} />
        <StatCard title="Compaction" value="Tiered" helper="15m → daily ladder" />
        <StatCard title="Storage mode" value={settings.enabled ? "On" : "Off"} helper={settings.realtimeUsersOnly ? "realtime users only" : "eligible holdings"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="AI tokens 24h" value={fmtNumber(aiUsage.total24h)} helper={`${fmtNumber(aiUsage.input24h)} in · ${fmtNumber(aiUsage.output24h)} out`} />
        <StatCard title="AI tokens 7d" value={fmtNumber(aiUsage.total7d)} helper={`${fmtNumber(aiUsage.events7d)} logged calls`} />
        <StatCard title="Web-search calls 24h" value={fmtNumber(aiUsage.webSearch24h)} helper="should be 0 on worker" />
        <StatCard title="AI estimated cost 24h" value={`£${Number(aiUsage.estimatedCost24h || 0).toFixed(2)}`} helper="only if rates are configured" />
        <StatCard title="AI guardrail" value={aiEnv.aiMarketSearchEnabled ? "Open" : "Locked"} helper={aiEnv.webSearchMarketLookupEnabled ? "web search allowed" : "web search blocked"} />
      </div>

      <section className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <SectionCard title="Storage settings" description="Store one raw share-price point per ticker/exchange, not per user holding. User charts multiply these shared prices by their own units, so one stored Apple/LSE/NYSE point can serve every eligible user.">
          <form action={saveInvestmentSnapshotSettings} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="rounded-3xl bg-slate-50 p-4 text-sm font-black text-slate-800"><input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="mr-2" /> Save chart points automatically</label>
              <label className="rounded-3xl bg-slate-50 p-4 text-sm font-black text-slate-800"><input type="checkbox" name="market_hours_only" defaultChecked={settings.marketHoursOnly} className="mr-2" /> Only during market hours</label>
              <label className="rounded-3xl bg-slate-50 p-4 text-sm font-black text-slate-800"><input type="checkbox" name="realtime_users_only" defaultChecked={settings.realtimeUsersOnly} className="mr-2" /> Realtime/paid users only</label>
              <label className="rounded-3xl bg-emerald-50 p-4 text-sm font-black text-emerald-900"><input type="checkbox" name="global_raw_points" defaultChecked={settings.globalRawPricePoints} className="mr-2" /> Store global raw share-price points</label>
              <label className="rounded-3xl bg-blue-50 p-4 text-sm font-black text-blue-900"><input type="checkbox" name="manual_refresh_uses_latest_global" defaultChecked={settings.manualRefreshUsesLatestGlobal} className="mr-2" /> Manual refresh can use latest 1m point</label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label><span className="text-xs font-black uppercase text-slate-500">Realtime users</span><input name="realtime_minutes" type="number" min="1" defaultValue={settings.realtimeMinutes} className={inputClass()} /><span className="mt-1 block text-xs font-bold text-slate-500">minutes between shared raw-price points</span></label>
              <label><span className="text-xs font-black uppercase text-slate-500">Plus / Pro users</span><input name="plus_pro_minutes" type="number" min="5" defaultValue={settings.plusProMinutes} className={inputClass()} /><span className="mt-1 block text-xs font-bold text-slate-500">default 15-minute cadence</span></label>
              <label><span className="text-xs font-black uppercase text-slate-500">Free users</span><input name="free_minutes" type="number" min="10" defaultValue={settings.freeMinutes} className={inputClass()} /><span className="mt-1 block text-xs font-bold text-slate-500">default 30-minute cadence</span></label>
              <input name="min_minutes" type="hidden" value={settings.plusProMinutes} />
              <input name="retain_days" type="hidden" value={settings.retainDays} />
              <input name="max_points_per_holding" type="hidden" value={settings.maxPointsPerHolding} />
            </div>
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">Retention is automatic: 15-minute points for 1 month, 30-minute buckets for 3–6 months, hourly for 6–12 months, half-day for 1–2 years, then daily points for older history. The prune/compact SQL runs from the snapshot job and can also be run manually below.</div>
            <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Save storage settings</button>
          </form>
        </SectionCard>

        <SectionCard title="Manual chart vs stored points" description="This is the practical difference from the manual orientation you already have.">
          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-3xl border border-slate-200 bg-white p-5"><LineChart className="h-6 w-6 text-slate-500" /><h3 className="mt-3 text-lg font-black">Manual/current orientation</h3><p className="mt-2 text-sm font-bold leading-6 text-slate-600">Good for a current portfolio breakdown and one-off calculation. It uses the holdings you have now, so it can show a pie by stock/account, but it does not prove what the value was at each previous point unless a history point was saved.</p></article>
            <article className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><BarChart3 className="h-6 w-6 text-emerald-700" /><h3 className="mt-3 text-lg font-black text-emerald-950">Stored chart points</h3><p className="mt-2 text-sm font-bold leading-6 text-emerald-800">Best for real chart history. It stores raw market prices per ticker/exchange over time, then every user’s chart is rendered from their own unit history against those shared price points.</p></article>
          </div>
          <p className="mt-4 rounded-3xl bg-slate-50 p-4 text-sm font-black text-slate-700">{manualVsStored}</p>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <SectionCard title="AI spend guardrails" description="The market worker should price known stocks without OpenAI. Web-search resolution is now opt-in only and should stay off unless you deliberately resolve unknown instruments.">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Market AI search</p><p className="mt-1 text-lg font-black">{aiEnv.aiMarketSearchEnabled ? "Enabled" : "Disabled"}</p><p className="mt-1 text-xs font-bold text-slate-500">LOOP_ENABLE_AI_MARKET_SEARCH</p></div>
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Web search lookup</p><p className="mt-1 text-lg font-black">{aiEnv.webSearchMarketLookupEnabled ? "Enabled" : "Disabled"}</p><p className="mt-1 text-xs font-bold text-slate-500">LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP</p></div>
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Worker AI coverage</p><p className="mt-1 text-lg font-black">{aiEnv.marketWorkerAiCoverageEnabled ? "Enabled" : "Disabled"}</p><p className="mt-1 text-xs font-bold text-slate-500">MARKET_DATA_WORKER_AI_COVERAGE_ENABLED</p></div>
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">OpenAI key visible here</p><p className="mt-1 text-lg font-black">{aiEnv.hasOpenAiKey ? "Yes" : "No"}</p><p className="mt-1 text-xs font-bold text-slate-500">Remove it from the worker service unless resolving coverage.</p></div>
          </div>
          <p className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Safe default: leave market AI search, web-search lookup and worker AI coverage disabled. Unknown tickers should be queued for admin review; known mapped listings should update from market data without OpenAI.</p>
        </SectionCard>

        <SectionCard title="AI usage by token" description="Logged OpenAI usage from LOOP flows. If this is empty, run the v28.35 SQL migration and confirm the app is writing to loop_ai_usage_events.">
          <div className="space-y-3">
            {aiUsage.byScope.slice(0, 8).map((row: any) => <article key={row.scope} className="rounded-2xl bg-slate-50 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-black text-slate-950">{row.scope}</p><p className="mt-1 text-xs font-bold text-slate-500">{fmtNumber(row.events)} calls · {fmtNumber(row.webSearch)} web-search calls</p></div><div className="text-right"><p className="font-black text-slate-950">{fmtNumber(row.total)} tokens</p><p className="mt-1 text-xs font-bold text-slate-500">{fmtNumber(row.input)} in · {fmtNumber(row.output)} out</p></div></div></article>)}
            {!aiUsage.byScope.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No AI usage logged yet.</p> : null}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="Database usage detail" description="Actual sizes are returned by the SQL helper once the migration is installed; until then the page falls back to a conservative estimate.">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Table</p><p className="mt-1 text-2xl font-black">{fmtBytes(Number(usage.tableBytes || usage.table_bytes || 0))}</p></div>
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Indexes</p><p className="mt-1 text-2xl font-black">{fmtBytes(Number(usage.indexBytes || usage.index_bytes || 0))}</p></div>
            <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Date span</p><p className="mt-1 text-sm font-black">{usage.oldest ? new Date(usage.oldest).toLocaleDateString("en-GB") : "—"} → {usage.newest ? new Date(usage.newest).toLocaleDateString("en-GB") : "—"}</p></div>
          </div>
          <form action={pruneInvestmentSnapshotsNow} className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-start gap-3"><Trash2 className="h-5 w-5 text-amber-700" /><p className="text-sm font-bold text-amber-900">Compact raw global price points using the tiered retention ladder, and prune excess user holding snapshots kept for legacy charts.</p></div><button className="rounded-2xl bg-amber-700 px-5 py-3 text-sm font-black text-white">Prune now</button></div></form>
        </SectionCard>

        <SectionCard title="Recent stored points" description="Live feed view. This refreshes automatically and shows native traded currency under the GBP equivalent.">
          <div className="space-y-3">
            {recent.map((row: any, index: number) => <article key={`${row.point_at}-${index}`} className="rounded-2xl bg-slate-50 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-black text-slate-950">{row.ticker || "Ticker"} · {row.exchange_code || "Market"}</p><p className="mt-1 text-xs font-bold text-slate-500">{row.source || "snapshot"} · {row.bucket_interval || "raw"}</p></div><div className="text-right"><p className="font-black text-slate-950">£{Number(row.gbp_price ?? row.price_gbp ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 4 })}</p><p className="mt-1 text-xs font-black text-slate-500">{row.native_currency ? `${row.native_currency} ${Number(row.native_price || 0).toFixed(row.native_currency === "GBX" ? 2 : 4)}` : "native pending"}</p><p className="mt-1 text-xs font-bold text-slate-400">{row.point_at ? new Date(row.point_at).toLocaleString("en-GB") : ""}</p></div></div></article>)}
            {!recent.length ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No stored chart points yet.</p> : null}
          </div>
        </SectionCard>
      </section>
      </main>
    </>
  );
}
