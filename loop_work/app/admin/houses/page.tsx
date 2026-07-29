import type React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Bot, CheckCircle2, ExternalLink, Home, PlayCircle, RefreshCw, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { createClient } from "@/lib/supabase/server";
import { describeSupabaseAdminKey } from "@/lib/supabase/admin";
import { cronSecretConfigured } from "@/lib/security/cron";
import { markMortgageDealFixedAndNotify, runHouseMortgageWatchNow, runMortgageCatalogueRefreshNow, saveMortgageCatalogueDeal, saveMortgageCatalogueSource, updateMortgageCatalogueDealStatus } from "./actions";

type SearchParams = Promise<{ tab?: string }>;

async function safe<T>(promise: PromiseLike<{ data: T | null; error?: any }>, fallback: T): Promise<T> {
  try {
    const result = await promise;
    return result.error ? fallback : (result.data || fallback);
  } catch {
    return fallback;
  }
}

function inputClass() {
  return "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2";
}

function InlineField({ label, children, helper }: { label: string; children: React.ReactNode; helper?: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700">{label}</span>{children}{helper ? <span className="mt-1 block text-xs font-bold text-slate-500">{helper}</span> : null}</label>;
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} className={`rounded-full px-4 py-2 text-sm font-black ${active ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-950"}`}>{children}</Link>;
}

function Stat({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    red: "border-red-200 bg-red-50 text-red-950",
    blue: "border-blue-200 bg-blue-50 text-blue-950",
  };
  return <div className={`rounded-3xl border p-4 shadow-sm ${tones[tone]}`}><p className="text-xs font-black uppercase tracking-wide opacity-60">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>;
}

function StatusPill({ status, count }: { status?: string | null; count?: number | null }) {
  const value = String(status || "unknown");
  const cls = value === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : value === "needs_review" ? "bg-amber-50 text-amber-700 ring-amber-200" : value === "broken" ? "bg-red-50 text-red-700 ring-red-200" : value === "expired" || value === "removed" ? "bg-slate-100 text-slate-500 ring-slate-200" : "bg-blue-50 text-blue-700 ring-blue-200";
  return <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${cls}`}>{value.replaceAll("_", " ")}{count ? ` · ${count} flag(s)` : ""}</span>;
}

export default async function AdminHousesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const activeTab = params.tab || "mortgage-catalogue";
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/houses")}`);
  if (!access.isAdmin) redirect("/admin");

  const adminKeyStatus = describeSupabaseAdminKey();
  const adminSupabase = createBestAdminClient();
  const supabase = adminSupabase || await createClient();
  const usingAdminSupabase = Boolean(adminSupabase);

  const [deals, flaggedDeals, flags, sources, runs, sourceJobs, homes, futureTasks] = await Promise.all([
    safe<any[]>(supabase.from("mortgage_rate_deals").select("*").order("broken_report_count", { ascending: false }).order("updated_at", { ascending: false }).limit(80), []),
    safe<any[]>(supabase.from("mortgage_rate_deals").select("id,status,catalogue_status,lender_name,product_name,rate_percent,source_url,broken_report_count,last_broken_report_at").gt("broken_report_count", 0).order("last_broken_report_at", { ascending: false }).limit(30), []),
    safe<any[]>(supabase.from("mortgage_rate_deal_flags").select("id,user_id,mortgage_rate_deal_id,issue_kind,detail,status,created_at").in("status", ["open", "checking"]).order("created_at", { ascending: false }).limit(40), []),
    safe<any[]>(supabase.from("mortgage_lender_sources").select("*").order("last_checked_at", { ascending: true, nullsFirst: true }).limit(80), []),
    safe<any[]>(supabase.from("mortgage_renewal_watch_runs").select("*").order("started_at", { ascending: false }).limit(6), []),
    safe<any[]>(supabase.from("wealth_watch_source_jobs").select("*").eq("job_kind", "mortgage_catalogue_refresh").order("created_at", { ascending: false }).limit(8), []),
    safe<any[]>(supabase.from("homes").select("id,property_value,estimated_value_mid,postcode,uprn,lookup_source,last_lookup_at").limit(200), []),
    safe<any[]>(supabase.from("app_future_integration_tasks").select("*").in("product_key", ["mortgage_catalogue", "property_enrichment", "valuation_automation", "admin_rework"]).order("priority", { ascending: true }).limit(80), []),
  ]);

  const activeDeals = deals.filter((deal) => deal.status === "active").length;
  const needsReview = deals.filter((deal) => deal.status === "needs_review" || deal.catalogue_status === "needs_review").length;
  const broken = deals.filter((deal) => deal.status === "broken" || Number(deal.broken_report_count || 0) > 0).length;
  const removed = deals.filter((deal) => deal.catalogue_status === "removed" || deal.status === "expired").length;
  const withUprn = homes.filter((home) => home.uprn).length;
  const cronOk = cronSecretConfigured();

  return (
    <main className="mx-auto max-w-[2000px] space-y-6 px-4 py-8 md:px-6">
      <AdminTabs />

      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-300">Admin · House</p>
        <h1 className="mt-2 text-4xl font-black">House, mortgage catalogue and valuation automation</h1>
        <p className="mt-3 max-w-5xl text-sm font-bold leading-6 text-white/70">This is the new product-domain admin page. Mortgage deal sourcing, source checks, user flags, EPC/council-tax enrichment and UPRN decisions sit here instead of being scattered across Wealth Watch.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <span className={`rounded-full px-4 py-2 text-xs font-black ${cronOk ? "bg-emerald-400 text-emerald-950" : "bg-red-400 text-red-950"}`}>{cronOk ? "CRON_SECRET configured" : "CRON_SECRET missing"}</span>
          <Link href="/mortgage" className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-950">Open user house page</Link>
          <Link href="/admin/future-integrations" className="rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white">Future integrations checklist</Link>
        </div>
      </section>

      {!usingAdminSupabase ? (
        <section className="rounded-[2rem] border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <div className="flex gap-3">
            <AlertTriangle className="mt-1 h-6 w-6 shrink-0" />
            <div>
              <h2 className="text-xl font-black">House admin is using safe read mode</h2>
              <p className="mt-1 text-sm font-bold leading-6">{adminKeyStatus.reason} The page can still render, but source jobs and catalogue writes need a server-only Supabase service role or <code className="rounded bg-white px-1 py-0.5">sb_secret_</code> key available to this runtime.</p>
              <p className="mt-2 text-xs font-black uppercase tracking-wide text-amber-700">Accepted env names: SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, SUPABASE_ADMIN_KEY.</p>
            </div>
          </div>
        </section>
      ) : null}

      <nav className="flex flex-wrap gap-2">
        <TabLink href="/admin/houses?tab=mortgage-catalogue" active={activeTab === "mortgage-catalogue"}>Mortgage catalogue</TabLink>
        <TabLink href="/admin/houses?tab=accepted" active={activeTab === "accepted"}>Accepted catalogue</TabLink>
        <TabLink href="/admin/houses?tab=quality" active={activeTab === "quality"}>Broken / flagged</TabLink>
        <TabLink href="/admin/houses?tab=valuation" active={activeTab === "valuation"}>Valuation + EPC</TabLink>
        <TabLink href="/admin/houses?tab=setup" active={activeTab === "setup"}>Setup checklist</TabLink>
      </nav>

      <section className="grid gap-4 md:grid-cols-4">
        <Stat label="Active mortgage products" value={activeDeals} tone={activeDeals ? "green" : "amber"} />
        <Stat label="Needs admin review" value={needsReview} tone={needsReview ? "amber" : "green"} />
        <Stat label="Broken / user flagged" value={broken} tone={broken ? "red" : "green"} />
        <Stat label="Removed / expired" value={removed} tone="slate" />
      </section>

      {activeTab === "mortgage-catalogue" ? (
        <>
          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[2rem] border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <div className="flex items-start gap-3"><Bot className="mt-1 h-6 w-6 text-blue-700" /><div><h2 className="text-2xl font-black text-slate-950">AI/source catalogue refresh</h2><p className="mt-1 text-sm font-bold leading-6 text-slate-600">Checks lender source pages and saves extracted rows as reviewable mortgage products. During beta, keep auto-publish threshold high so users only see admin-approved active rows.</p></div></div>
              <form action={runMortgageCatalogueRefreshNow} className="mt-5 grid gap-3 md:grid-cols-4">
                <InlineField label="Sources to check" helper="Keep small while testing."><input name="limit" type="number" min="1" defaultValue="12" placeholder="12" className={inputClass()} /></InlineField>
                <InlineField label="Auto-publish confidence" helper="95 means review almost everything."><input name="publish_confidence" type="number" min="0" max="100" defaultValue="95" placeholder="95" className={inputClass()} /></InlineField>
                <InlineField label="Source" helper="Choose one source or run all due sources."><select name="source_id" className={`${inputClass()} md:col-span-2`}><option value="">All due sources</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.lender_name} · {source.source_url}</option>)}</select></InlineField>
                <button className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white md:col-span-4"><RefreshCw className="mr-2 inline h-4 w-4" />Run catalogue refresh</button>
              </form>
            </div>
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3"><PlayCircle className="mt-1 h-6 w-6 text-emerald-700" /><div><h2 className="text-2xl font-black text-slate-950">Run mortgage watch after review</h2><p className="mt-1 text-sm font-bold leading-6 text-slate-600">Only active catalogue rows are used for user recommendations. Run this after publishing reviewed products.</p></div></div>
              <form action={runHouseMortgageWatchNow} className="mt-5 flex flex-wrap items-end gap-3"><InlineField label="User mortgages to check" helper="Max records processed this run."><input name="limit" type="number" min="1" defaultValue="250" placeholder="250" className={`${inputClass()} max-w-xs`} /></InlineField><button className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white">Run mortgage watch</button></form>
              <div className="mt-5 grid gap-3 md:grid-cols-2">{sourceJobs.map((job) => <article key={job.id} className="rounded-2xl bg-slate-50 p-3"><p className="font-black text-slate-950">{job.status}</p><p className="mt-1 text-xs font-bold text-slate-500">{job.created_at ? new Date(job.created_at).toLocaleString("en-GB") : ""}</p><p className="mt-1 text-xs font-semibold text-slate-400">{job.result_payload ? JSON.stringify(job.result_payload).slice(0, 120) : ""}</p></article>)}</div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-2xl font-black">Mortgage product catalogue</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">Rows marked needs review are not meant to be used by the user-facing mortgage watch. Publish only after checking the lender page.</p>
              <div className="mt-5 space-y-3">
                {deals.map((deal) => <DealRow key={deal.id} deal={deal} />)}
                {!deals.length ? <Empty label="No mortgage products yet. Add lender sources and run catalogue refresh." /> : null}
              </div>
            </div>
            <div className="space-y-6">
              <form action={saveMortgageCatalogueSource} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-2xl font-black">Add lender source</h2>
                <div className="mt-4 space-y-3">
                  <InlineField label="Lender / building society"><input name="lender_name" placeholder="e.g. NatWest, Halifax, Nationwide" className={inputClass()} /></InlineField>
                  <InlineField label="Source URL" helper="Paste the public mortgage rates, product transfer or SVR page."><input name="source_url" type="url" placeholder="https://www.lender.co.uk/mortgage-rates" className={inputClass()} /></InlineField>
                  <InlineField label="Source kind"><select name="source_kind" className={inputClass()}><option value="lender_product_page">Lender product page</option><option value="current_lender_transfer">Current-lender product transfer</option><option value="svr_follow_on">SVR / follow-on rates</option><option value="manual_catalogue">Manual catalogue</option></select></InlineField>
                  <InlineField label="Status"><select name="status" className={inputClass()}><option value="active">Active</option><option value="needs_review">Needs review</option><option value="paused">Paused</option></select></InlineField>
                  <InlineField label="Notes / mapping instructions"><textarea name="notes" placeholder="What should AI look for on this page? Fees, LTV bands, product transfer notes, SVR wording…" className={`${inputClass()} min-h-24`} /></InlineField>
                  <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Save source</button>
                </div>
              </form>
              <form action={saveMortgageCatalogueDeal} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-2xl font-black">Manual product row</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <InlineField label="Lender"><input name="lender_name" placeholder="e.g. Barclays" className={inputClass()} /></InlineField>
                  <InlineField label="Product name"><input name="product_name" placeholder="e.g. 5 year fixed, product transfer" className={inputClass()} /></InlineField>
                  <InlineField label="Rate %"><input name="rate_percent" type="number" step="0.001" placeholder="4.75" className={inputClass()} /></InlineField>
                  <InlineField label="Initial term months"><input name="initial_term_months" type="number" step="1" placeholder="24, 36 or 60" className={inputClass()} /></InlineField>
                  <InlineField label="Max LTV %"><input name="ltv_max" type="number" step="0.01" placeholder="60, 75, 85 or 90" className={inputClass()} /></InlineField>
                  <InlineField label="Product fee £"><input name="product_fee" type="number" step="0.01" placeholder="0, 999 or 1499" className={inputClass()} /></InlineField>
                  <InlineField label="Source URL" helper="Used for user checking and broken-link reports."><input name="source_url" type="url" placeholder="https://www.lender.co.uk/product-page" className={`${inputClass()} md:col-span-2`} /></InlineField>
                  <InlineField label="Review status"><select name="status" className={inputClass()}><option value="active">Active</option><option value="needs_review">Needs review</option><option value="draft">Draft</option></select></InlineField>
                  <label className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-800"><input type="checkbox" name="existing_customer_only" className="mr-2" /> Existing customer only</label>
                </div>
                <button className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Save product</button>
              </form>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "accepted" ? (
        <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black text-emerald-950">Accepted live catalogue</h2>
              <p className="mt-1 text-sm font-bold text-emerald-800">Only these active rows can appear to users. Keep checking that each row still appears on the lender source with the same rate, fee, term and LTV.</p>
            </div>
            <form action={runMortgageCatalogueRefreshNow}>
              <input type="hidden" name="limit" value="25" />
              <input type="hidden" name="source" value="all" />
              <input type="hidden" name="auto_publish_confidence" value="98" />
              <button className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white">Re-check live accepted rows</button>
            </form>
          </div>
          <div className="mt-5 space-y-3">
            {deals.filter((deal) => deal.status === "active").map((deal) => <DealRow key={deal.id} deal={deal} />)}
            {deals.filter((deal) => deal.status === "active").length === 0 ? <Empty label="No accepted/live mortgage products yet." /> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "quality" ? (
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[2rem] border border-red-200 bg-red-50 p-5 shadow-sm">
            <div className="flex items-start gap-3"><TriangleAlert className="mt-1 h-6 w-6 text-red-700" /><div><h2 className="text-2xl font-black text-red-950">Flagged products</h2><p className="mt-1 text-sm font-bold text-red-800">When fixed, mark the product fixed and LOOP will notify users who reported it.</p></div></div>
            <div className="mt-5 space-y-3">{flaggedDeals.map((deal) => <DealRow key={deal.id} deal={deal} compact />)}{!flaggedDeals.length ? <Empty label="No flagged mortgage products." /> : null}</div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-black">Open user reports</h2>
            <div className="mt-5 space-y-3">{flags.map((flag) => <article key={flag.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{flag.issue_kind?.replaceAll("_", " ")}</p><p className="mt-1 text-sm font-bold text-slate-600">{flag.detail || "No extra detail"}</p><p className="mt-1 text-xs font-bold text-slate-400">{flag.created_at ? new Date(flag.created_at).toLocaleString("en-GB") : ""}</p></div><StatusPill status={flag.status} /></div></article>)}{!flags.length ? <Empty label="No open reports." /> : null}</div>
          </div>
        </section>
      ) : null}

      {activeTab === "valuation" ? (
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3"><Home className="mt-1 h-6 w-6 text-slate-700" /><div><h2 className="text-2xl font-black">Property enrichment approach</h2><p className="mt-1 text-sm font-bold leading-6 text-slate-600">Listings are useful for EPC and council-tax extraction. New builds or missing fields should remain user-editable. Keep source, date and confidence visible.</p></div></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2"><Stat label="Homes sampled" value={homes.length} /><Stat label="Homes with UPRN" value={`${withUprn}/${homes.length || 0}`} tone={withUprn ? "green" : "amber"} /></div>
            <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-black text-amber-950">FindMyAddress guidance</h3><p className="mt-2 text-sm font-bold leading-6 text-amber-800">Use FindMyAddress for manual spot-checking only. Do not scrape it for commercial/automated LOOP lookups. Production UPRN automation should use OS Open UPRN/OS Data Hub or a licensed address provider.</p><a href="https://www.findmyaddress.co.uk/search" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-amber-900 ring-1 ring-amber-200">Open manual lookup <ExternalLink className="h-3 w-3" /></a></div>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-black">Automation ladder</h2>
            <div className="mt-5 space-y-3">
              <AutomationStep title="1. Listing extraction" body="Pull EPC rating, council-tax band and guide price from listings where visible. Mark confidence as listing-derived." />
              <AutomationStep title="2. User correction" body="If missing/new-build, ask user to input EPC/council tax and save source as user-confirmed." />
              <AutomationStep title="3. UPRN identity" body="Use licensed/open UPRN source to anchor address identity, not postcode alone." />
              <AutomationStep title="4. Valuation sources" body="Blend Land Registry comparables, manual valuation, and optional paid AVM for higher licence tiers." />
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "setup" ? (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">House setup checklist</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">Tick these off in Future Integrations; completed tasks disappear from the active list there and are logged.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">{futureTasks.map((task) => <article key={task.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-start gap-3"><CheckCircle2 className={`mt-1 h-5 w-5 ${task.status === "done" ? "text-emerald-600" : "text-slate-300"}`} /><div><p className="font-black text-slate-950">{task.title}</p><p className="mt-1 text-sm font-bold leading-6 text-slate-500">{task.description}</p><p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-400">{task.product_key} · {task.section} · {task.status}</p></div></div></article>)}{!futureTasks.length ? <Empty label="No setup tasks found. Run the v28.13 SQL migration." /> : null}</div>
        </section>
      ) : null}

      {!cronOk ? <section className="rounded-[2rem] border border-red-200 bg-red-50 p-5 text-red-900"><div className="flex gap-3"><AlertTriangle className="h-6 w-6" /><div><h2 className="text-xl font-black">Add CRON_SECRET before production</h2><p className="mt-1 text-sm font-bold">Catalogue and watch cron routes should be protected server-side.</p></div></div></section> : null}
    </main>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500">{label}</p>;
}

function AutomationStep({ title, body }: { title: string; body: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="font-black text-slate-950">{title}</p><p className="mt-1 text-sm font-bold leading-6 text-slate-500">{body}</p></div>;
}


function mortgageDealTermMeta(deal: any) {
  const text = `${deal.product_name || ""} ${deal.recommendation_kind || ""} ${deal.rate_type || ""}`.toLowerCase();
  const months = Number(deal.initial_term_months || 0);
  if (/\b(svr|variable|tracker)\b/.test(text)) return { label: text.includes("tracker") ? "Tracker / variable" : "SVR / variable", className: "bg-purple-50 text-purple-800 ring-purple-200" };
  const yearsFromText = text.match(/\b(2|3|5|10)\s*(?:yr|year)/);
  const years = months ? months / 12 : yearsFromText ? Number(yearsFromText[1]) : 0;
  if (years === 2) return { label: "2 year", className: "bg-blue-50 text-blue-800 ring-blue-200" };
  if (years === 3) return { label: "3 year", className: "bg-indigo-50 text-indigo-800 ring-indigo-200" };
  if (years === 5) return { label: "5 year", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
  if (years === 10) return { label: "10 year", className: "bg-teal-50 text-teal-800 ring-teal-200" };
  if (months > 0) return { label: `${months} months`, className: "bg-sky-50 text-sky-800 ring-sky-200" };
  return { label: "Term needs check", className: "bg-slate-100 text-slate-700 ring-slate-200" };
}

function DealTermPill({ deal }: { deal: any }) {
  const meta = mortgageDealTermMeta(deal);
  return <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${meta.className}`}>{meta.label}</span>;
}

function DealRow({ deal, compact = false }: { deal: any; compact?: boolean }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><StatusPill status={deal.status || deal.catalogue_status} count={Number(deal.broken_report_count || 0)} /></div>
          <h3 className="mt-3 text-lg font-black text-slate-950">{deal.lender_name || "Lender"}</h3>
          <p className="mt-1 text-sm font-bold text-slate-600">{deal.product_name || "Unnamed product"}</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-400">{deal.source_url || "No source URL"}</p>
          {!compact && deal.admin_review_reason ? <p className="mt-2 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800">{deal.admin_review_reason}</p> : null}
          {!compact ? <p className="mt-2 text-xs font-black text-slate-500">Extraction confidence: {Number(deal.extraction_confidence || deal.confidence_score || 0) ? `${Number(deal.extraction_confidence || deal.confidence_score || 0).toFixed(0)}%` : "not scored"} · Last seen: {deal.last_seen_at ? new Date(deal.last_seen_at).toLocaleString("en-GB") : "needs live check"}</p> : null}
        </div>
        <div className="min-w-[180px] text-right">
          <p className="text-4xl font-black text-slate-950">{Number(deal.rate_percent || 0).toFixed(2)}%</p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <DealTermPill deal={deal} />
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-200">{deal.product_fee ? `£${Number(deal.product_fee).toLocaleString()} fee` : "No/unknown fee"}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">{deal.ltv_max ? `${deal.ltv_max}% LTV` : "LTV check"}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={updateMortgageCatalogueDealStatus}><input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="status" value="active" /><button className="rounded-full bg-emerald-700 px-3 py-2 text-xs font-black text-white">Publish</button></form>
        <form action={updateMortgageCatalogueDealStatus}><input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="status" value="needs_review" /><button className="rounded-full bg-amber-100 px-3 py-2 text-xs font-black text-amber-800">Needs review</button></form>
        <form action={updateMortgageCatalogueDealStatus}><input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="status" value="broken" /><button className="rounded-full bg-red-100 px-3 py-2 text-xs font-black text-red-700">Broken</button></form>
        <form action={updateMortgageCatalogueDealStatus}><input type="hidden" name="deal_id" value={deal.id} /><input type="hidden" name="status" value="expired" /><button className="rounded-full bg-slate-200 px-3 py-2 text-xs font-black text-slate-700">Expire</button></form>
        <form action={markMortgageDealFixedAndNotify}><input type="hidden" name="deal_id" value={deal.id} /><button className="rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white">Fixed + notify</button></form>
        {deal.source_url ? <a href={deal.source_url} target="_blank" rel="noreferrer" className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200">Open source</a> : null}
      </div>
    </article>
  );
}
