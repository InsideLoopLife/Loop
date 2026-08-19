"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { HomeWizard } from "@/components/mortgage/HomeWizard";
import { MortgageWizard } from "@/components/mortgage/MortgageWizard";
import { ValuationWizard } from "@/components/mortgage/ValuationWizard";
import { MoveQueryWizard } from "@/components/mortgage/MoveQueryWizard";
import { HouseWorkspaceOverview } from "@/components/mortgage/HouseWorkspaceOverview";
import { MortgageOverpaymentPlanner } from "@/components/mortgage/MortgageOverpaymentPlanner";
import { formatMoney } from "@/lib/format/money";
import type {
  MonthPlan,
  PayEventForPlan,
  SpendingCategoryForPlan,
} from "@/lib/planning/month-plan";
import type {
  Home,
  HomeMortgageDeal,
  HomeMortgageLiabilityAllocation,
  HomeOwner,
  HomeValuationSource,
  MarketRateBenchmark,
  LenderSvrKnowledge,
  MortgageMarketDeal,
  MortgageRenewalRecommendation,
  Person,
  PropertyMoveQuery,
} from "@/components/mortgage/MortgagePlannerClient";
import {
  addHome,
  addHomeMortgageDeal,
  addHomeValuationSource,
  archivePropertyMoveQuery,
  deleteHome,
  deleteHomeMortgageDeal,
  deleteHomeValuationSource,
  updateHome,
  updateHomeMortgageDeal,
  updateHomeValuationSource,
} from "@/app/mortgage/actions";
import { addAffordabilityScenario } from "@/app/affordability/actions";
import {
  buildHouseAffordabilityScore,
  currentMortgageSnapshot,
  valuationSummary,
} from "@/lib/wealth/house-snapshot";

type Tab = "overview" | "property" | "rates" | "affordability" | "overpayments" | "moving";
type ModalState =
  | null
  | { type: "add_home" }
  | { type: "edit_home"; home: Home }
  | { type: "add_mortgage"; homeId?: string }
  | { type: "edit_mortgage"; deal: HomeMortgageDeal }
  | { type: "add_valuation"; homeId?: string }
  | { type: "edit_valuation"; valuation: HomeValuationSource }
  | { type: "add_move" };

type Props = {
  homes: Home[];
  owners: HomeOwner[];
  people: Person[];
  deals: HomeMortgageDeal[];
  valuations: HomeValuationSource[];
  liabilityAllocations: HomeMortgageLiabilityAllocation[];
  moveQueries: PropertyMoveQuery[];
  renewalRecommendations: MortgageRenewalRecommendation[];
  marketDeals: MortgageMarketDeal[];
  boeBenchmarks: MarketRateBenchmark[];
  svrKnowledge: LenderSvrKnowledge[];
  monthPlan: MonthPlan;
  normalMonthPlan: MonthPlan;
  emergencySavings: number;
  categories: SpendingCategoryForPlan[];
  payEvents: PayEventForPlan[];
};

const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["property", "Property"],
  ["rates", "Mortgage & rates"],
  ["affordability", "Affordability"],
  ["overpayments", "Overpayments"],
  ["moving", "Moving home"],
];

const TAB_META: Record<Tab, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: "House overview", title: "Your home, in one place", description: "Property, mortgage, affordability and market context in one live view." },
  property: { eyebrow: "Property", title: "Your property", description: "The home record, valuation evidence and equity in one place." },
  rates: { eyebrow: "Mortgage & rates", title: "Mortgage rate scenarios", description: "Compare your current mortgage, LOOP market context and lender quotes." },
  affordability: { eyebrow: "Affordability", title: "Household resilience & what-if planning", description: "Known values are pulled from LOOP and remain editable for each scenario." },
  overpayments: { eyebrow: "Mortgage planning", title: "Overpayments & opportunity cost", description: "See what extra payments change — and compare that use of cash with alternatives." },
  moving: { eyebrow: "Moving home", title: "Saved move scenarios", description: "Keep potential moves and their household impact together." },
};

function mortgageCategory(category: SpendingCategoryForPlan) {
  return /mortgage|home loan/i.test(String(category.name || ""));
}

export function HouseUnifiedWorkspace(props: Props) {
  const search = useSearchParams();
  const requested = (search.get("tab") || "overview") as Tab;
  const [tab, setTab] = useState<Tab>(
    TABS.some(([id]) => id === requested) ? requested : "overview",
  );
  const [modal, setModal] = useState<ModalState>(null);

  const home = props.homes.find((h) => h.ownership_status === "current_home") ?? props.homes[0];
  const deal = props.deals.find((d) => d.home_id === home?.id) ?? props.deals[0];
  const value = valuationSummary(home, props.valuations);
  const mortgage = currentMortgageSnapshot(deal);
  const equity = Math.max(0, value.mid - mortgage.balance);
  const ltv = value.mid > 0 ? (mortgage.balance / value.mid) * 100 : 0;

  const affordability = useMemo(
    () =>
      buildHouseAffordabilityScore({
        monthPlan: props.normalMonthPlan,
        mortgagePayment: mortgage.payment,
        mortgageBalance: mortgage.balance,
        propertyValue: value.mid,
        emergencySavings: props.emergencySavings,
      }),
    [props.normalMonthPlan, props.emergencySavings, mortgage.payment, mortgage.balance, value.mid],
  );

  const bankRate = Number(
    props.boeBenchmarks.find((row) => row.term_type === "bank_rate")?.rate_percent ||
      props.svrKnowledge.find((row) => Number(row.current_bank_rate || 0) > 0)?.current_bank_rate ||
      0,
  );
  const fixedRows = props.boeBenchmarks
    .filter((row) => row.term_type === "2yr_fixed" && Number(row.rate_percent) > 0)
    .sort((a, b) => Number(a.ltv_tier ?? 100) - Number(b.ltv_tier ?? 100));
  const benchmark = fixedRows.find((row) => Number(row.ltv_tier ?? 100) >= ltv) ?? fixedRows.at(-1);

  const annualGross = props.payEvents.reduce(
    (sum, event) => sum + Number(event.gross_annual_salary || 0),
    0,
  );
  const fixedExMortgage = props.categories
    .filter((category) => ["fixed", "debt"].includes(String(category.type)))
    .filter((category) => !mortgageCategory(category))
    .reduce((sum, category) => sum + Number(category.monthly_budget || 0), 0);
  const childMonthly = props.normalMonthPlan.outgoingItems
    .filter((item) => /child|nursery|childcare|wraparound|school/i.test(item.label))
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

  const pageMeta = TAB_META[tab];
  const latestBenchmarkDate = props.boeBenchmarks.map((row) => row.effective_month).filter(Boolean).sort().reverse()[0] || null;
  const marketProxy = props.marketDeals.filter((item) => Number(item.rate_percent || 0) > 0).filter((item) => item.ltv_max == null || Number(item.ltv_max) >= ltv).sort((a,b) => Number(a.rate_percent || 99) - Number(b.rate_percent || 99))[0];
  const planningRate = Number(benchmark?.rate_percent || marketProxy?.rate_percent || 0);

  function choose(next: Tab) {
    setTab(next);
    window.history.replaceState({}, "", next === "overview" ? "/mortgage" : `/mortgage?tab=${next}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  return (
    <main className="mx-auto w-full max-w-[1900px] overflow-x-hidden px-3 pb-28 pt-4 font-sans sm:px-5 lg:px-6 xl:px-8">
      <nav className="mb-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => choose(id)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${tab === id ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{label}</button>
        ))}
      </nav>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">House</p>
              {TABS.map(([id, label]) => (
                <button key={id} onClick={() => choose(id)} className={`mb-1 block w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold ${tab === id ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
              ))}
              <div className="my-3 border-t border-slate-100" />
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Quick actions</p>
              <button onClick={() => setModal({ type: "add_home" })} className="block w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50">＋ Add property</button>
              <button onClick={() => setModal({ type: "add_mortgage", homeId: home?.id })} className="block w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50">▣ Add mortgage</button>
              <button onClick={() => choose("rates")} className="block w-full rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50">⇄ Compare rates</button>
            </div>

            {home ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="px-2 pt-1 text-xs font-bold">Your properties</p>
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-sky-100 to-violet-100">🏠</div><div className="min-w-0"><p className="truncate text-sm font-bold">{home.label}</p><p className="text-[10px] font-bold text-violet-600">● Primary residence</p></div></div>
                  <p className="mt-3 text-[10px] font-bold text-slate-400">Estimated value</p><p className="text-sm font-bold">{formatMoney(value.mid)}</p>
                  <p className="mt-2 text-[10px] font-bold text-slate-400">Equity</p><p className="text-sm font-bold">{formatMoney(equity)}</p>
                  <button onClick={() => choose("property")} className="mt-3 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700">View property</button>
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0">
          <header data-house-shared-header className="mx-auto mb-6 flex min-h-[112px] w-full max-w-[1540px] items-start justify-between gap-4">
            <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">{pageMeta.eyebrow}</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{pageMeta.title}</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">{pageMeta.description}</p></div>
            <div className="shrink-0 pt-1">
              {tab === "property" ? <button onClick={() => setModal(home ? { type: "edit_home", home } : { type: "add_home" })} className="rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-xs font-bold text-violet-700">Edit property</button> : null}
              {tab === "moving" ? <button onClick={() => setModal({ type: "add_move" })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white">+ Add move</button> : null}
              {tab === "rates" ? <div className="text-right"><p className={`text-xs font-bold ${latestBenchmarkDate ? "text-emerald-700" : "text-amber-700"}`}>● Rate data {latestBenchmarkDate ? "loaded" : "incomplete"}</p><p className="mt-1 text-[11px] font-semibold text-slate-400">{latestBenchmarkDate || "No benchmark date returned"}</p></div> : null}
            </div>
          </header>
          {tab === "overview" ? (
            <div className="mx-auto w-full max-w-[1540px] space-y-6 lg:space-y-7">

              <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                {[["Current mortgage",formatMoney(mortgage.balance),`${ltv.toFixed(1)}% LTV`],["Monthly payment",formatMoney(mortgage.payment),deal?`${Number(deal.interest_rate).toFixed(2)}% · ${deal.lender || ""}`:"No mortgage"],["Home value",formatMoney(value.mid),`${formatMoney(value.low)} – ${formatMoney(value.high)}`]].map(([label,main,helper]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:min-h-[122px] lg:p-5"><p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold">{main}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{helper}</p></article>)}
                <button onClick={() => choose("affordability")} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md lg:min-h-[122px] lg:p-5"><p className="text-[10px] font-bold uppercase text-slate-400">Affordability</p><p className="mt-2 text-2xl font-bold">{affordability.score}/100</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{affordability.label} · <span className="text-violet-700">View planning →</span></p></button>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <article className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm"><p className="text-[10px] font-bold uppercase text-emerald-700">Bank of England</p><p className="mt-2 text-3xl font-bold">{bankRate ? `${bankRate.toFixed(2)}%` : "Data unavailable"}</p><p className="mt-1 text-xs text-slate-600">Current Bank Rate · market context.</p></article>
                <article className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5 shadow-sm"><p className="text-[10px] font-bold uppercase text-violet-700">BoE mortgage benchmark</p><p className="mt-2 text-3xl font-bold">{benchmark ? `${Number(benchmark.rate_percent).toFixed(2)}%` : "Pending"}</p><p className="mt-1 text-xs text-slate-600">{benchmark ? "Nearest 2-year fixed benchmark for your LTV." : "BoE July 2026 fallback · 2-year fixed 75% LTV."}</p></article>
              </section>

              <section className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
                <div className="grid lg:grid-cols-[1.15fr_.85fr]">
                  <div className="relative min-h-[280px] overflow-hidden bg-slate-100 sm:min-h-[360px] lg:min-h-[470px]">
                    {home?.latitude && home?.longitude ? <iframe title={`${home.label} map`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(home.longitude)-0.006}%2C${Number(home.latitude)-0.006}%2C${Number(home.longitude)+0.006}%2C${Number(home.latitude)+0.006}&layer=mapnik&marker=${home.latitude}%2C${home.longitude}`} className="absolute inset-0 h-full w-full border-0" loading="lazy"/> : null}
                    <button onClick={() => choose("affordability")} className={`absolute right-4 top-4 rounded-2xl p-4 text-left shadow-lg ring-1 transition hover:scale-[1.02] ${affordability.tone}`}><p className="text-[10px] font-bold uppercase">Affordability</p><p className="text-3xl font-bold">{affordability.score}/100</p><p className="text-[11px] font-semibold">{affordability.label} · Open →</p></button>
                    <div className="absolute inset-x-4 bottom-4 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-white/95 p-3 shadow-lg"><p className="text-[10px] font-bold uppercase text-slate-400">Current home</p><p className="font-bold">{home?.label || "Home"}</p></div><div className="rounded-xl bg-white/95 p-3 shadow-lg"><p className="text-[10px] font-bold uppercase text-slate-400">Valuation range</p><p className="font-bold">{formatMoney(value.low)} – {formatMoney(value.high)}</p></div><div className="rounded-xl bg-white/95 p-3 shadow-lg"><p className="text-[10px] font-bold uppercase text-slate-400">Mortgage</p><p className="font-bold">{formatMoney(mortgage.balance)}</p><p className="text-[10px] text-slate-500">{ltv.toFixed(1)}% LTV · {formatMoney(mortgage.payment)}/mo</p></div></div>
                  </div>
                  <div className="p-5 sm:p-6 lg:flex lg:min-h-[470px] lg:flex-col lg:justify-center lg:p-8"><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">Current property</p><h2 className="mt-2 text-2xl font-bold">{home?.label || "Add a property"}</h2><p className="mt-1 text-sm text-slate-500">{home?.full_address || home?.address_line}</p><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase text-slate-400">Lender</p><p className="mt-1 text-lg font-bold">{deal?.lender || "—"}</p><p className="text-[11px] text-slate-500">{deal?.product_name}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase text-slate-400">Current payment</p><p className="mt-1 text-lg font-bold">{formatMoney(mortgage.payment)}</p><p className="text-[11px] text-slate-500">{deal ? `${Number(deal.interest_rate).toFixed(2)}%` : ""}</p></div></div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setModal(home ? { type: "edit_home", home } : { type: "add_home" })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white">Edit property</button><button onClick={() => setModal(deal ? { type: "edit_mortgage", deal } : { type: "add_mortgage", homeId: home?.id })} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-bold text-violet-700">Edit mortgage</button><button onClick={() => choose("rates")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold">Compare rates</button></div></div>
                </div>
              </section>
            </div>
          ) : null}

          {tab === "property" ? (
            <div className="mx-auto max-w-[1460px] space-y-5"><section className="grid gap-4 lg:grid-cols-[1fr_.8fr]"><div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">{home?.latitude && home?.longitude ? <iframe title="Property map" src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(home.longitude)-0.006}%2C${Number(home.latitude)-0.006}%2C${Number(home.longitude)+0.006}%2C${Number(home.latitude)+0.006}&layer=mapnik&marker=${home.latitude}%2C${home.longitude}`} className="absolute inset-0 h-full w-full border-0"/> : null}</div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">{home?.label}</h2><p className="mt-1 text-sm text-slate-500">{home?.full_address}</p><dl className="mt-5 space-y-3">{[["Purchase",formatMoney(Number(home?.purchase_price || 0))],["Value",formatMoney(value.mid)],["Valuation range",`${formatMoney(value.low)} – ${formatMoney(value.high)}`],["Equity",formatMoney(equity)],["UPRN",home?.uprn || "—"]].map(([l,v]) => <div key={l} className="flex justify-between gap-4 border-b border-slate-100 pb-3"><dt className="text-sm text-slate-500">{l}</dt><dd className="text-sm font-bold">{v}</dd></div>)}</dl></div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Valuation sources</h2><button onClick={() => setModal({ type: "add_valuation", homeId: home?.id })} className="text-xs font-bold text-violet-700">+ Add valuation</button></div><div className="mt-4 space-y-2">{props.valuations.filter(v => v.home_id === home?.id).map(v => <button key={v.id} onClick={() => setModal({ type: "edit_valuation", valuation: v })} className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-3 text-left"><span><span className="block text-sm font-bold">{v.source_name}</span><span className="text-xs text-slate-500">{v.valuation_date}</span></span><span className="font-bold">{formatMoney(Number(v.valuation_mid ?? v.valuation_amount ?? 0))}</span></button>)}</div></section></div>
          ) : null}

          {tab === "rates" ? <div className="mx-auto max-w-[1460px]"><HouseWorkspaceOverview homes={props.homes} deals={props.deals} valuations={props.valuations} renewalRecommendations={props.renewalRecommendations} marketDeals={props.marketDeals} moveQueries={props.moveQueries} boeBenchmarks={props.boeBenchmarks}/></div> : null}

          {tab === "affordability" ? (
            <div className="mx-auto max-w-[1460px] space-y-5"><section className="grid gap-4 lg:grid-cols-[.7fr_1.3fr]"><div className={`rounded-2xl p-5 ring-1 ${affordability.tone}`}><p className="text-xs font-bold uppercase">Current affordability</p><p className="mt-2 text-5xl font-bold">{affordability.score}/100</p><p className="mt-1 font-bold">{affordability.label}</p><div className="mt-5 space-y-2">{affordability.criteria.map(c => <div key={c.label} className="rounded-xl bg-white/70 p-3"><div className="flex justify-between text-xs font-bold"><span>{c.label}</span><span>{c.points}/{c.max}</span></div><p className="mt-1 text-[11px] opacity-70">{c.reason}</p></div>)}</div></div><form action={addAffordabilityScenario} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Build a move scenario</h2><p className="mt-1 text-xs text-slate-500">Change any prefilled value without changing the original House record.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{[["label","Scenario name","text",""],["purchase_price","Target house price","number",""],["deposit_cash","Additional deposit cash","number",0],["current_property_sale_price","Current property sale price","number",value.mid],["current_mortgage_balance","Current mortgage balance","number",mortgage.balance],["gross_household_income","Gross household income","number",annualGross],["monthly_fixed_costs","Fixed/debt costs (mortgage excluded)","number",fixedExMortgage],["monthly_childcare","Monthly child costs","number",childMonthly],["interest_rate","Interest rate %","number",Number(benchmark?.rate_percent || deal?.interest_rate || 4.75)],["stress_rate","Stress rate %","number",6.5],["term_years","Term years","number",Number(deal?.term_years || 30)],["arrangement_and_moving_costs","Fees / moving costs","number",3500]].map(([name,label,type,defaultValue]) => <label key={String(name)} className="block"><span className="text-xs font-bold text-slate-600">{label}</span><input name={String(name)} type={String(type)} step={type === "number" ? "0.01" : undefined} defaultValue={defaultValue as string | number} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"/></label>)}</div><button className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Save scenario</button></form></section></div>
          ) : null}

          {tab === "overpayments" ? (
            <div className="mx-auto w-full max-w-[1540px]"><MortgageOverpaymentPlanner deal={deal} currentBalance={mortgage.balance} currentPayment={mortgage.payment} benchmarkRate={planningRate} /></div>
          ) : null}

          {tab === "moving" ? (
            <div className="mx-auto max-w-[1460px] space-y-5"><section className="grid gap-3 md:grid-cols-2">{props.moveQueries.map(q => <article key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><div><h2 className="font-bold">{q.title || q.address_hint || "Move scenario"}</h2><p className="text-xs text-slate-500">{q.postcode}</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">{Number(q.affordability_score || 0)}/100</span></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">Asking price</p><p className="font-bold">{formatMoney(Number(q.asking_price || 0))}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">Mortgage est.</p><p className="font-bold">{formatMoney(Number(q.expected_payment || 0))}/mo</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">Stamp duty</p><p className="font-bold">{formatMoney(Number(q.stamp_duty_estimate || 0))}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-400">Moving costs</p><p className="font-bold">{formatMoney(Number(q.moving_cost_estimate || 0))}</p></div></div><form action={archivePropertyMoveQuery} className="mt-4"><input type="hidden" name="id" value={q.id}/><button className="text-xs font-bold text-rose-600">Archive scenario</button></form></article>)}</section></div>
          ) : null}
        </div>
      </div>

      {modal ? (
        <ModalFrame title={modal.type === "add_home" ? "Add property" : modal.type === "edit_home" ? "Edit property" : modal.type === "add_mortgage" ? "Add mortgage" : modal.type === "edit_mortgage" ? "Edit mortgage" : modal.type === "add_valuation" ? "Add valuation" : modal.type === "edit_valuation" ? "Edit valuation" : "Add move scenario"} onClose={() => setModal(null)}>
          {modal.type === "add_home" ? <HomeWizard people={props.people} owners={props.owners} action={addHome}/> : null}
          {modal.type === "edit_home" ? <><HomeWizard people={props.people} owners={props.owners} home={modal.home} action={updateHome}/><form action={deleteHome} className="mt-4"><input type="hidden" name="id" value={modal.home.id}/><button className="text-xs font-bold text-rose-600">Delete property</button></form></> : null}
          {modal.type === "add_mortgage" ? <MortgageWizard homes={props.homes} people={props.people} allocations={props.liabilityAllocations} homeId={modal.homeId} action={addHomeMortgageDeal}/> : null}
          {modal.type === "edit_mortgage" ? <><MortgageWizard homes={props.homes} people={props.people} allocations={props.liabilityAllocations} deal={modal.deal} action={updateHomeMortgageDeal}/><form action={deleteHomeMortgageDeal} className="mt-4"><input type="hidden" name="id" value={modal.deal.id}/><button className="text-xs font-bold text-rose-600">Delete mortgage</button></form></> : null}
          {modal.type === "add_valuation" ? <ValuationWizard homes={props.homes} homeId={modal.homeId} action={addHomeValuationSource}/> : null}
          {modal.type === "edit_valuation" ? <><ValuationWizard homes={props.homes} valuation={modal.valuation} action={updateHomeValuationSource}/><form action={deleteHomeValuationSource} className="mt-4"><input type="hidden" name="id" value={modal.valuation.id}/><button className="text-xs font-bold text-rose-600">Delete valuation</button></form></> : null}
          {modal.type === "add_move" ? <MoveQueryWizard homes={props.homes}/> : null}
        </ModalFrame>
      ) : null}
    </main>
  );
}
