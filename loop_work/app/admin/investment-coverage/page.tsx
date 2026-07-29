import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { createInvestmentCoveragePlan } from "./actions";

type SearchParams = { q?: string; show?: string };

type VenueRow = {
  id?: string;
  venue_code?: string | null;
  venue_mic?: string | null;
  operating_mic?: string | null;
  name?: string | null;
  country_code?: string | null;
  currency?: string | null;
  timezone?: string | null;
  open_time?: string | null;
  close_time?: string | null;
  price_scale?: number | null;
  active?: boolean | null;
};

type AliasRow = {
  venue_code?: string | null;
  alias_source?: string | null;
  alias_type?: string | null;
  alias_value?: string | null;
};

type HoldingRow = {
  exchange?: string | null;
  native_exchange?: string | null;
  ticker?: string | null;
  price_check_status?: string | null;
  instrument_resolution_status?: string | null;
  price_polling_enabled?: boolean | null;
};

type RequestRow = {
  id: string;
  request_query?: string | null;
  exchange_hint?: string | null;
  inferred_market_code?: string | null;
  status?: string | null;
  match_confidence?: number | null;
  progress?: any;
  updated_at?: string | null;
  created_at?: string | null;
};

const seedVenues: VenueRow[] = [
  { venue_code: "LSE", venue_mic: "XLON", name: "London Stock Exchange", country_code: "GB", currency: "GBX", timezone: "Europe/London", open_time: "08:00", close_time: "16:30", active: true },
  { venue_code: "AIM", venue_mic: "AIMX", name: "Alternative Investment Market", country_code: "GB", currency: "GBX", timezone: "Europe/London", open_time: "08:00", close_time: "16:30", active: true },
  { venue_code: "NASDAQ", venue_mic: "XNAS", name: "Nasdaq", country_code: "US", currency: "USD", timezone: "America/New_York", open_time: "09:30", close_time: "16:00", active: true },
  { venue_code: "NYSE", venue_mic: "XNYS", name: "New York Stock Exchange", country_code: "US", currency: "USD", timezone: "America/New_York", open_time: "09:30", close_time: "16:00", active: true },
  { venue_code: "XETR", venue_mic: "XETR", name: "Xetra", country_code: "DE", currency: "EUR", timezone: "Europe/Berlin", open_time: "09:00", close_time: "17:30", active: true },
  { venue_code: "XPAR", venue_mic: "XPAR", name: "Euronext Paris", country_code: "FR", currency: "EUR", timezone: "Europe/Paris", open_time: "09:00", close_time: "17:30", active: true },
];

function normalise(value?: string | null) {
  return String(value || "").trim().toUpperCase();
}

function venueKey(value?: string | null) {
  const clean = normalise(value);
  if (!clean) return "UNKNOWN";
  if (["XLON", "XLSE", "LON", "LDN"].includes(clean)) return "LSE";
  if (["AIMX", "XLON-AIM"].includes(clean)) return "AIM";
  if (["XNAS", "XNCM", "XNGS", "NMS", "NGM", "NCM", "NASDAQGS"].includes(clean)) return "NASDAQ";
  if (["XNYS", "NYQ"].includes(clean)) return "NYSE";
  if (["XASE", "ASE", "NYSEAMERICAN"].includes(clean)) return "AMEX";
  if (["OTC", "OOTC"].includes(clean)) return "OTCM";
  if (["PINK", "OTCPK"].includes(clean)) return "PINX";
  if (["ETR", "IBIS", "XETRA"].includes(clean)) return "XETR";
  if (["FRA", "FRANKFURT", "F"].includes(clean)) return "XFRA";
  if (["EPA", "PAR", "PA", "PARIS"].includes(clean)) return "XPAR";
  return clean;
}

function matchesSearch(venue: VenueRow, aliases: AliasRow[], q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const fields = [venue.venue_code, venue.venue_mic, venue.operating_mic, venue.name, venue.country_code, venue.currency, venue.timezone].filter(Boolean).join(" ").toLowerCase();
  if (fields.includes(needle)) return true;
  return aliases.some((alias) => venueKey(alias.venue_code) === venueKey(venue.venue_code) && `${alias.alias_value || ""} ${alias.alias_type || ""} ${alias.alias_source || ""}`.toLowerCase().includes(needle));
}

function countBy<T>(rows: T[], getKey: (row: T) => string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

async function loadCoverageData(supabase: any) {
  const [venuesRes, aliasesRes, holdingsRes, requestsRes, sourcesRes, snaptradeRes] = await Promise.all([
    supabase.from("investment_market_venues").select("id,venue_code,venue_mic,operating_mic,name,country_code,currency,timezone,open_time,close_time,price_scale,active").order("country_code", { ascending: true }).order("venue_code", { ascending: true }).limit(500),
    supabase.from("investment_market_aliases").select("venue_code,alias_source,alias_type,alias_value").limit(2000),
    supabase.from("investment_holdings").select("ticker,exchange,native_exchange,price_check_status,instrument_resolution_status,price_polling_enabled").limit(5000),
    supabase.from("loop_investment_ai_market_requests").select("id,request_query,exchange_hint,inferred_market_code,status,match_confidence,progress,updated_at,created_at").order("created_at", { ascending: false }).limit(80),
    supabase.from("loop_investment_coverage_sources").select("*").limit(100),
    supabase.from("loop_investment_snaptrade_health").select("*").order("checked_at", { ascending: false }).limit(1),
  ]);

  const venues = venuesRes.error || !venuesRes.data?.length ? seedVenues : venuesRes.data as VenueRow[];
  const aliases = aliasesRes.error ? [] : (aliasesRes.data || []) as AliasRow[];
  const holdings = holdingsRes.error ? [] : (holdingsRes.data || []) as HoldingRow[];
  const requests = requestsRes.error ? [] : (requestsRes.data || []) as RequestRow[];
  const sources = sourcesRes.error ? [] : sourcesRes.data || [];
  const snaptrade = snaptradeRes.error ? [] : snaptradeRes.data || [];
  return { venues, aliases, holdings, requests, sources, snaptrade, usingSeedVenues: Boolean(venuesRes.error || !venuesRes.data?.length), errors: [venuesRes.error, aliasesRes.error, holdingsRes.error, requestsRes.error].filter(Boolean) };
}

function CoveragePill({ status }: { status?: string | null }) {
  const clean = String(status || "covered").toLowerCase();
  const cls = clean.includes("required") || clean.includes("review") || clean.includes("fail") ? "bg-amber-100 text-amber-800" : clean.includes("covered") || clean.includes("active") ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${cls}`}>{status || "covered"}</span>;
}

export default async function InvestmentCoveragePage({ searchParams }: { searchParams?: Promise<SearchParams> | SearchParams }) {
  const resolvedParams = searchParams && typeof (searchParams as any).then === "function" ? await searchParams as SearchParams : (searchParams || {}) as SearchParams;
  const q = String(resolvedParams.q || "").trim();
  const showAll = resolvedParams.show === "all" || q.length > 0;
  const supabase = await createClient();
  const { venues, aliases, holdings, requests, sources, snaptrade, usingSeedVenues, errors } = await loadCoverageData(supabase);
  const holdingCounts = countBy(holdings, (row) => venueKey(row.exchange || row.native_exchange));
  const failedCounts = countBy(holdings.filter((row) => ["coverage_required", "quote_not_found", "needs_review"].includes(String(row.price_check_status || row.instrument_resolution_status || ""))), (row) => venueKey(row.exchange || row.native_exchange));
  const aliasCounts = countBy(aliases, (row) => venueKey(row.venue_code));
  const filtered = venues.filter((venue) => matchesSearch(venue, aliases, q));
  const sorted = filtered.sort((a, b) => (holdingCounts.get(venueKey(b.venue_code)) || 0) - (holdingCounts.get(venueKey(a.venue_code)) || 0) || String(a.country_code || "").localeCompare(String(b.country_code || "")) || String(a.venue_code || "").localeCompare(String(b.venue_code || "")));
  const visibleMarkets = showAll ? sorted : sorted.slice(0, 6);
  const coverageRequired = holdings.filter((row) => ["coverage_required", "quote_not_found", "needs_review"].includes(String(row.price_check_status || row.instrument_resolution_status || ""))).slice(0, 30);

  return (
    <main className="mx-auto w-[95vw] max-w-none space-y-6 p-4">
      <AdminTabs />
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin investment</p>
        <h1 className="mt-2 text-4xl font-black">Investment coverage</h1>
        <p className="mt-3 max-w-4xl text-sm font-bold text-white/75">Understand which global markets LOOP recognises, which broker/platform aliases map to those markets, and which holdings were paused for admin coverage instead of using paid AI/web-search.</p>
      </section>

      {errors.length ? <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">Some optional coverage tables are not available yet. Run the latest investment coverage SQL migrations. Details: {errors.map((err: any) => err?.message).join(" · ")}</section> : null}
      {usingSeedVenues ? <section className="rounded-[2rem] border border-sky-200 bg-sky-50 p-5 text-sm font-bold text-sky-950">No persisted market venue rows were returned, so this page is showing LOOP seed venues. Once the global mapping SQL lands, this panel will become the full searchable market catalogue.</section> : null}

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Markets recognised</p><p className="mt-1 text-3xl font-black">{venues.length}</p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Aliases mapped</p><p className="mt-1 text-3xl font-black">{aliases.length}</p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">Coverage required</p><p className="mt-1 text-3xl font-black">{coverageRequired.length}</p></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">SnapTrade latest</p><p className="mt-1 text-3xl font-black">{snaptrade?.[0]?.status || "unknown"}</p></div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-black">Markets</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">Search by venue code, MIC, broker alias, country, currency or market name. Six most-used markets show by default.</p>
          </div>
          <form className="flex w-full gap-2 lg:w-[34rem]">
            <input name="q" defaultValue={q} placeholder="Search markets, MICs, aliases e.g. XFRA, TYO, GER40, HK..." className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200" />
            <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Search</button>
          </form>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleMarkets.map((market) => {
            const code = venueKey(market.venue_code);
            const used = holdingCounts.get(code) || 0;
            const failed = failedCounts.get(code) || 0;
            const aliasCount = aliasCounts.get(code) || 0;
            return <article key={code} className="rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{code} · {market.name || code}</p><p className="mt-1 text-sm font-bold text-slate-500">MIC {market.venue_mic || "—"} · {market.country_code || "—"} · {market.currency || "—"}</p></div><CoveragePill status={failed ? "needs coverage" : "covered"} /></div>
              <p className="mt-3 text-sm font-bold text-slate-500">{market.timezone || "timezone unknown"} · {market.open_time || "—"}–{market.close_time || "—"} · price scale {market.price_scale ?? 1}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black"><span className="rounded-2xl bg-white p-2">{used}<br/><span className="text-slate-400">holdings</span></span><span className="rounded-2xl bg-white p-2">{aliasCount}<br/><span className="text-slate-400">aliases</span></span><span className="rounded-2xl bg-white p-2">{failed}<br/><span className="text-slate-400">flags</span></span></div>
            </article>;
          })}
          {!visibleMarkets.length ? <p className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500 md:col-span-2 xl:col-span-3">No markets matched that search.</p> : null}
        </div>
        {!showAll && sorted.length > visibleMarkets.length ? <Link href="/admin/investment-coverage?show=all" className="mt-4 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">View all {sorted.length} markets</Link> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">Coverage required</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">These were skipped by the worker and should be mapped by admin. The worker will not spend AI/web-search on them.</p>
          <div className="mt-4 space-y-3">
            {coverageRequired.map((row, index) => <article key={`${row.ticker}-${row.exchange}-${index}`} className="rounded-3xl border border-amber-100 bg-amber-50 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-black text-amber-950">{row.ticker || "Unknown ticker"} · {row.exchange || row.native_exchange || "market unknown"}</p><p className="mt-1 text-sm font-bold text-amber-800">{row.price_check_status || row.instrument_resolution_status || "needs review"}</p></div><CoveragePill status="admin review" /></div></article>)}
            {!coverageRequired.length ? <p className="rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No paused coverage flags at the moment.</p> : null}
          </div>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">Admin coverage planner</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">Use this for manual coverage tasks. Keep AI/web-search disabled in the market worker.</p>
          <form action={createInvestmentCoveragePlan} className="mt-4 space-y-3">
            <textarea name="coverage_prompt" placeholder="Add coverage for KOZ1 on XFRA / Frankfurt, or map Trading 212 alias GER40 to XETR..." required className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200" />
            <div className="grid gap-3 md:grid-cols-2">
              <input name="market_code_override" placeholder="Market code e.g. XFRA" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
              <input name="market_name_override" placeholder="Market name" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
              <input name="country_code_override" placeholder="Country e.g. DE" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
              <input name="currency_code_override" placeholder="Currency e.g. EUR" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold" />
            </div>
            <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Save coverage request</button>
          </form>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Quote sources / pricing coverage</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">Markets describe where securities trade. Sources describe how LOOP prices them.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-3xl bg-slate-50 p-4"><p className="font-black">Yahoo / deterministic delayed quotes</p><p className="text-sm font-bold text-slate-500">Used for mapped share and ETF listings. No AI spend.</p></article>
          <article className="rounded-3xl bg-slate-50 p-4"><p className="font-black">SnapTrade provider values</p><p className="text-sm font-bold text-slate-500">Used for provider units/accounts, then mapped to market listings where possible.</p></article>
          <article className="rounded-3xl bg-slate-50 p-4"><p className="font-black">Provider fund NAV</p><p className="text-sm font-bold text-slate-500">Daily fund/unit prices where the asset is not exchange traded.</p></article>
          {sources.map((source: any) => <article key={source.id || source.source_name} className="rounded-3xl bg-slate-50 p-4"><p className="font-black">{source.source_name}</p><p className="text-sm font-bold text-slate-500">{source.source_kind} · every {source.check_frequency_minutes || 1440} mins</p><p className="text-sm text-slate-500">Markets: {(source.markets || []).join(", ") || "none"}</p></article>)}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Recent admin coverage requests</h2>
        <div className="mt-4 space-y-3">
          {requests.slice(0, 20).map((request) => <details key={request.id} className="rounded-3xl bg-slate-50 p-4"><summary className="cursor-pointer font-black">{request.request_query || request.inferred_market_code || "REQUEST"} · {request.exchange_hint || "market"} · {request.status || "planned"}</summary><pre className="mt-3 overflow-auto rounded-2xl bg-white p-3 text-xs font-bold text-slate-700">{JSON.stringify(request.progress || {}, null, 2)}</pre></details>)}
          {!requests.length ? <p className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">No coverage requests yet.</p> : null}
        </div>
      </section>
    </main>
  );
}
