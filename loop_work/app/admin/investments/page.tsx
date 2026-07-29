import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, Database, LineChart, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";

async function safe<T>(promise: PromiseLike<{ data: T | null; error?: any }>, fallback: T): Promise<T> {
  try {
    const result = await promise;
    return result.error ? fallback : (result.data || fallback);
  } catch {
    return fallback;
  }
}

export default async function AdminInvestmentsPage() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/investments")}`);
  if (!access.isAdmin) redirect("/admin");
  const supabase = createBestAdminClient();
  const [pots, holdings, storageSettings, providerConnections, snapshots, coverageRequests] = supabase ? await Promise.all([
    safe<any[]>(supabase.from("investment_accounts").select("id,external_provider,last_provider_sync_at,provider_cash_source").limit(5000), []),
    safe<any[]>(supabase.from("investment_holdings").select("id,exchange,external_provider,last_provider_sync_at").limit(5000), []),
    safe<any[]>(supabase.from("investment_storage_settings").select("*").limit(20), []),
    safe<any[]>(supabase.from("integration_connections").select("id,provider,status,last_synced_at").eq("provider", "SnapTrade").limit(5000), []),
    safe<any[]>(supabase.from("investment_instrument_price_points").select("id,point_at,source,ticker,exchange_code").order("point_at", { ascending: false }).limit(100), []),
    safe<any[]>(supabase.from("loop_investment_ai_market_requests").select("id,status,request_query,created_at,updated_at").order("created_at", { ascending: false }).limit(100), []),
  ]) : [[], [], [], [], [], []];

  return (
    <main className="mx-auto max-w-[2000px] space-y-6 px-4 py-8 md:px-6">
      <AdminTabs />
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin · Investments</p>
        <h1 className="mt-2 text-4xl font-black">Investment admin</h1>
        <p className="mt-3 max-w-4xl text-sm font-bold text-white/70">Coverage, quote providers, chart storage and SnapTrade/data-source checks are grouped here so investment admin does not scatter across the main admin nav.</p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Investment pots" value={pots.length} />
        <Stat label="Holdings" value={holdings.length} />
        <Stat label="Storage rows" value={storageSettings.length} />
      </section>
      <section className="rounded-[2rem] border border-blue-200 bg-blue-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-1 h-6 w-6 text-blue-700" />
          <div>
            <h2 className="text-2xl font-black text-slate-950">Investment update cadence</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-slate-600">Use this as the admin truth-table for how values update. Broker sync updates accounts/holdings/cash when the user refreshes or the SnapTrade cron runs. Snapshot jobs then store points for charts and daily movement. Trading 212 direct API keys can later improve cash, transaction lots and dividend cash where SnapTrade does not expose them.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Stat label="SnapTrade connections" value={providerConnections.length} />
          <Stat label="Provider pots" value={pots.filter((pot: any) => pot.external_provider).length} />
          <Stat label="Latest raw price points" value={snapshots.length} />
          <Stat label="Cash source rows" value={pots.filter((pot: any) => pot.provider_cash_source).length} />
          <Stat label="Coverage queue" value={coverageRequests.filter((row: any) => !["active", "complete", "completed"].includes(String(row.status || "").toLowerCase())).length} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <AdminCard href="/integrations" icon={<ShieldCheck className="h-6 w-6" />} title="User broker refresh" body="Users refresh SnapTrade/Trading 212 accounts here; LOOP stores cash buckets when the provider exposes them and keeps manual overrides where needed." />
          <AdminCard href="/admin/investment-storage" icon={<Database className="h-6 w-6" />} title="Raw price-point storage" body="Control shared ticker price storage, tier cadence and automatic compaction." />
          <AdminCard href="/admin/investment-coverage" icon={<Bot className="h-6 w-6" />} title="Coverage queue" body="Review ticker/ETF requests, AI enrichment status, logo/document/fee lookup and starter history." />
          <AdminCard href="/api/admin/run-investment-price-snapshot" icon={<RefreshCw className="h-6 w-6" />} title="Run price snapshot now" body="Manual force-run for development. Production should call this route every minute with CRON_SECRET." />
          <AdminCard href="/api/admin/run-investment-coverage-queue" icon={<Bot className="h-6 w-6" />} title="Process coverage queue" body="Attempts to resolve queued no-match instruments and update placeholders." />
          <AdminCard href="/admin/future-integrations" icon={<Settings className="h-6 w-6" />} title="Trading 212 direct API" body="Next correction layer for exact account cash, open-position P/L, orders, dividends and transaction history when a user adds their own Trading 212 API key." />
        </div>
        <div className="mt-5 rounded-3xl border border-blue-100 bg-white/70 p-4">
          <p className="text-sm font-black text-slate-950">Update schedule now visible here</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Cadence label="Broker account sync" value="Target 60 min / manual refresh" helper="SnapTrade account/position/cash import. User can refresh from Integrations." />
            <Cadence label="Raw price points" value="1m / 15m / 30m by tier" helper="Vercel/external cron calls investment-price-snapshots every minute; route then decides which tickers are due by tier." />
            <Cadence label="Trading 212 correction" value="Planned direct layer" helper="Will use account summary, positions, orders, dividends and transactions when per-account key exists." />
          </div>
        </div>
      </section>
      <section className="grid gap-6 md:grid-cols-3">
        <AdminCard href="/admin/investment-coverage" icon={<LineChart className="h-6 w-6" />} title="Coverage" body="Markets, providers, quote-source coverage and live/early/after-market labels." />
        <AdminCard href="/admin/investment-storage" icon={<Database className="h-6 w-6" />} title="Chart storage" body="Shared raw ticker points, retention ladder, DB usage and historical chart controls." />
        <AdminCard href="/integrations" icon={<ShieldCheck className="h-6 w-6" />} title="Broker integrations" body="User-facing SnapTrade account import management lives here until there is a full admin integration console." />
        <AdminCard href="/admin/tiers" icon={<Settings className="h-6 w-6" />} title="Tier gates" body="Premium/real-time market data costs and entitlement checks." />
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-slate-950">{value}</p></div>;
}

function Cadence({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-slate-950">{value}</p><p className="mt-1 text-xs font-bold leading-5 text-slate-500">{helper}</p></div>;
}

function AdminCard({ href, icon, title, body }: { href: string; icon: React.ReactNode; title: string; body: string }) {
  return <Link href={href} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><span className="text-slate-600">{icon}</span><h2 className="mt-4 text-2xl font-black text-slate-950">{title}</h2><p className="mt-2 text-sm font-bold leading-6 text-slate-500">{body}</p></Link>;
}
