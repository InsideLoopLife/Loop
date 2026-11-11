"use client";

import { calculateProjectedMortgageBalance } from "@/lib/calculations/mortgage";
import { effectiveMortgageStart, wholeMonthsBetween } from "@/lib/calculations/mortgage-term";
import { WeeklyDealSearch, type MortgageDealSearchRow } from "@/components/mortgage/WeeklyDealSearch";
import { AreaPriceCard, DealHistory, MortgageFacts, RenewalCountdown, RunningCosts, TermNote } from "@/components/mortgage/HouseOverviewExtras";
import type { AreaPrices } from "@/lib/property/house-price-index";
import { MortgageMarketReference } from "@/components/mortgage/MortgageMarketReference";
import type { MortgageNewsItem } from "@/lib/wealth/mortgage-news";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { HomeWizard } from "@/components/mortgage/HomeWizard";
import { MortgageWizard } from "@/components/mortgage/MortgageWizard";
import { ValuationWizard } from "@/components/mortgage/ValuationWizard";
import { MoveQueryWizard } from "@/components/mortgage/MoveQueryWizard";
import { formatMoney } from "@/lib/format/money";

function DeferredHousePanel({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="h-3 w-28 animate-pulse rounded-full bg-slate-100" />
      <div className="mt-4 h-8 w-56 animate-pulse rounded-xl bg-slate-100" />
      <p className="mt-3 text-xs font-semibold text-slate-400">{label}</p>
    </div>
  );
}

const HouseWorkspaceOverview = dynamic(
  () => import("@/components/mortgage/HouseWorkspaceOverview").then((m) => m.HouseWorkspaceOverview),
  { loading: () => <DeferredHousePanel label="Loading mortgage comparisons…" /> },
);

const AffordabilityPlanningPanel = dynamic(
  () => import("@/components/mortgage/AffordabilityPlanningPanel").then((m) => m.AffordabilityPlanningPanel),
  { loading: () => <DeferredHousePanel label="Analysing household affordability…" /> },
);

const MortgageOverpaymentPlanner = dynamic(
  () => import("@/components/mortgage/MortgageOverpaymentPlanner").then((m) => m.MortgageOverpaymentPlanner),
  { loading: () => <DeferredHousePanel label="Preparing overpayment scenarios…" /> },
);
import { writeHouseRouteCache } from "@/lib/client/house-route-cache";
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
  | { type: "add_move" }
  | { type: "move_score"; query: PropertyMoveQuery };

export type HouseUnifiedWorkspaceProps = {
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
  mortgageNews?: MortgageNewsItem[];
  dealSearch?: MortgageDealSearchRow[];
  areaPrices?: AreaPrices | null;
  monthPlan: MonthPlan;
  normalMonthPlan: MonthPlan;
  temporaryIncomeContext: { label: string; endDate: string | null } | null;
  currentGrossHouseholdIncome: number;
  normalGrossHouseholdIncome: number;
  emergencySavings: number;
  categories: SpendingCategoryForPlan[];
  payEvents: PayEventForPlan[];
  cacheMode?: "fresh" | "stale";
};

const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["rates", "Renewal"],
  ["overpayments", "Overpayments"],
  ["moving", "Moving"],
];
// Older links: Property now lives on Overview, Affordability on Moving.
const TAB_ALIASES: Partial<Record<string, Tab>> = { property: "overview", affordability: "moving" };

const TAB_META: Record<Tab, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: "House overview", title: "Your home, in one place", description: "Property, mortgage, affordability and market context in one live view." },
  property: { eyebrow: "Property", title: "Your property", description: "The home record, valuation evidence and equity in one place." },
  rates: { eyebrow: "Renewal", title: "Your next mortgage deal", description: "The cheapest deals for your home this week, the best from your own lender, and where rates are heading." },
  affordability: { eyebrow: "Affordability", title: "Household resilience & what-if planning", description: "Known values are pulled from LOOP and remain editable for each scenario." },
  overpayments: { eyebrow: "Mortgage planning", title: "Overpayments & opportunity cost", description: "See what extra payments change — and compare that use of cash with alternatives." },
  moving: { eyebrow: "Moving", title: "Moving and affordability", description: "What the household could take on, and the homes you're watching." },
};

function mortgageCategory(category: SpendingCategoryForPlan) {
  return /mortgage|home loan/i.test(String(category.name || ""));
}

function moveScenarioScore(
  query: PropertyMoveQuery,
  monthPlan: MonthPlan,
  emergencySavings: number,
) {
  const propertyValue = Number(query.asking_price || 0);
  const mortgagePayment = Number(query.expected_payment || 0);
  const deposit = Number(query.target_deposit || 0);
  const mortgageBalance = Number(
    query.expected_mortgage_balance ||
      Math.max(0, propertyValue - deposit),
  );

  if (propertyValue <= 0 || mortgagePayment <= 0 || mortgageBalance <= 0) {
    return null;
  }

  return buildHouseAffordabilityScore({
    monthPlan,
    mortgagePayment,
    mortgageBalance,
    propertyValue,
    emergencySavings,
  });
}

function moveSourceLabel(url?: string | null) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("rightmove")) return "Rightmove";
    if (host.includes("zoopla")) return "Zoopla";
    if (host.includes("onthemarket")) return "OnTheMarket";
    return host;
  } catch {
    return "Original listing";
  }
}

export function HouseUnifiedWorkspace(props: HouseUnifiedWorkspaceProps) {
  const search = useSearchParams();
  const requestedRaw = search.get("tab") || "overview";
  const requested = (TAB_ALIASES[requestedRaw] ?? requestedRaw) as Tab;
  const [tab, setTab] = useState<Tab>(
    TABS.some(([id]) => id === requested) ? requested : "overview",
  );
  const [modal, setModal] = useState<ModalState>(null);
  const [showMaps, setShowMaps] = useState(false);

  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let timer: number | null = null;
    let idle: number | null = null;
    const reveal = () => setShowMaps(true);
    if (win.requestIdleCallback) idle = win.requestIdleCallback(reveal, { timeout: 900 });
    else timer = window.setTimeout(reveal, 350);
    return () => {
      if (idle !== null && win.cancelIdleCallback) win.cancelIdleCallback(idle);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (props.cacheMode === "stale") return;
    writeHouseRouteCache(props);
  }, [props]);

  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let timer: number | null = null;
    let idle: number | null = null;
    const warmTabs = () => {
      void import("@/components/mortgage/HouseWorkspaceOverview");
      void import("@/components/mortgage/AffordabilityPlanningPanel");
      void import("@/components/mortgage/MortgageOverpaymentPlanner");
    };
    if (win.requestIdleCallback) idle = win.requestIdleCallback(warmTabs, { timeout: 1800 });
    else timer = window.setTimeout(warmTabs, 1200);
    return () => {
      if (idle !== null && win.cancelIdleCallback) win.cancelIdleCallback(idle);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  const home = props.homes.find((h) => h.ownership_status === "current_home") ?? props.homes[0];
  const deal = props.deals.find((d) => d.home_id === home?.id) ?? props.deals[0];
  const value = valuationSummary(home, props.valuations);
  const mortgage = currentMortgageSnapshot(deal);
  const equity = Math.max(0, value.mid - mortgage.balance);
  const ltv = value.mid > 0 ? (mortgage.balance / value.mid) * 100 : 0;

  const currentAffordability = useMemo(
    () =>
      buildHouseAffordabilityScore({
        monthPlan: props.monthPlan,
        mortgagePayment: mortgage.payment,
        mortgageBalance: mortgage.balance,
        propertyValue: value.mid,
        emergencySavings: props.emergencySavings,
      }),
    [props.monthPlan, props.emergencySavings, mortgage.payment, mortgage.balance, value.mid],
  );
  const normalAffordability = useMemo(
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
  const hasTemporaryIncome =
    Boolean(props.temporaryIncomeContext) &&
    Math.abs(Number(props.monthPlan.income || 0) - Number(props.normalMonthPlan.income || 0)) > 1;

  // Only the Bank Rate the rates worker reads each day; the lender SVR notes
  // carry the rate from when each note was written, which goes stale.
  const bankRate = Number(props.boeBenchmarks.find((row) => row.term_type === "bank_rate")?.rate_percent || 0);
  const fixedRows = props.boeBenchmarks
    .filter((row) => row.term_type === "2yr_fixed" && Number(row.rate_percent) > 0)
    .sort((a, b) => Number(a.ltv_tier ?? 100) - Number(b.ltv_tier ?? 100));
  const benchmark = fixedRows.find((row) => Number(row.ltv_tier ?? 100) >= ltv) ?? fixedRows.at(-1);
  const fiveYearRows = props.boeBenchmarks
    .filter((row) => row.term_type === "5yr_fixed" && Number(row.rate_percent) > 0)
    .sort((a, b) => Number(a.ltv_tier ?? 100) - Number(b.ltv_tier ?? 100));
  const fiveYearBenchmark = fiveYearRows.find((row) => Number(row.ltv_tier ?? 100) >= ltv) ?? fiveYearRows.at(-1);

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
  // Balance and term left when the current deal ends (or today, if it has).
  const renewalPoint = useMemo(() => {
    if (!deal) return { balance: 0, monthsLeft: 0 };
    const endIso = deal.initial_period_end && new Date(`${deal.initial_period_end}T00:00:00`) > new Date() ? deal.initial_period_end : null;
    const at = endIso ? new Date(`${endIso}T00:00:00`) : new Date();
    const start = effectiveMortgageStart(deal as any).date;
    const balance = calculateProjectedMortgageBalance({
      openingBalance: Number(deal.balance || 0),
      annualInterestRate: Number(deal.interest_rate || 0),
      termYears: Number(deal.term_years || 25),
      balanceAsOfDate: deal.balance_as_of_date ?? deal.start_date,
      asOfDate: at,
      monthlyPayment: deal.monthly_payment_override,
      repaymentType: deal.repayment_type ?? "repayment",
      termStartDate: start,
    }).projectedBalance;
    const monthsLeft = Math.max(12, Math.round(Number(deal.term_years || 25) * 12) - (start ? wholeMonthsBetween(start, at) : 0));
    return { balance, monthsLeft };
  }, [deal]);

  // After the current deal: this week's cheapest real deal, else the Bank of England average.
  const weeklyBest = [...(props.dealSearch ?? [])].filter((row) => row.home_id === home?.id).sort((a, b) => b.searched_on.localeCompare(a.searched_on) || a.rank - b.rank)[0];
  const planningRate = Number(weeklyBest?.rate_percent || benchmark?.rate_percent || marketProxy?.rate_percent || 0);

  const selectedMoveScore =
    modal?.type === "move_score"
      ? moveScenarioScore(modal.query, props.monthPlan, props.emergencySavings)
      : null;
  const selectedMoveNormalScore =
    modal?.type === "move_score" && hasTemporaryIncome
      ? moveScenarioScore(
          modal.query,
          props.normalMonthPlan,
          props.emergencySavings,
        )
      : null;

  function choose(next: Tab) {
    setTab(next);
    window.history.replaceState({}, "", next === "overview" ? "/mortgage" : `/mortgage?tab=${next}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  return (
    <main className="mx-auto w-[95vw] max-w-none overflow-x-hidden px-4 pb-28 pt-4 font-sans md:px-8">
      {props.cacheMode === "stale" ? (
        <div className="pointer-events-none fixed right-5 top-20 z-30 rounded-full border border-violet-100 bg-white/95 px-3 py-2 text-[10px] font-bold text-violet-700 shadow-lg backdrop-blur">
          Refreshing live House data...
        </div>
      ) : null}

      <nav className="mb-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => choose(id)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${tab === id ? "bg-slate-950 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{label}</button>
        ))}
      </nav>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="fixed top-24 z-20 max-h-[calc(100vh-7rem)] w-[220px] space-y-4 overflow-y-auto pr-1 [scrollbar-width:thin]">
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

          </div>
        </aside>

        <div className="min-w-0">
          <header data-house-shared-header className="mx-auto mb-6 flex min-h-[112px] w-full max-w-none items-start justify-between gap-4">
            <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">{pageMeta.eyebrow}</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{pageMeta.title}</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">{pageMeta.description}</p></div>
            <div className="shrink-0 pt-1">
              {tab === "moving" ? <button onClick={() => setModal({ type: "add_move" })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white">+ Add move</button> : null}
            </div>
          </header>
          {tab === "overview" ? (
            <div className="mx-auto w-full max-w-none space-y-6 lg:space-y-7">

              <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                {[["Mortgage left",formatMoney(mortgage.balance),`${ltv.toFixed(1)}% of the home's value`],["Monthly payment",formatMoney(mortgage.payment),deal?`${Number(deal.interest_rate).toFixed(2)}% · ${deal.lender || ""}`:"No mortgage"],["Home value",formatMoney(value.mid),`${formatMoney(value.low)} – ${formatMoney(value.high)}`]].map(([label,main,helper]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:min-h-[122px] lg:p-5"><p className="text-[10px] font-bold uppercase text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold">{main}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{helper}</p></article>)}
                <button onClick={() => choose("moving")} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow-md lg:min-h-[122px] lg:p-5"><p className="text-[10px] font-bold uppercase text-slate-400">Affordability</p><p className="mt-2 text-2xl font-bold">{currentAffordability.score}/100</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{currentAffordability.label}{hasTemporaryIncome ? ` · normal ${normalAffordability.score}/100` : ""} · <span className="text-[var(--pine)]">Details →</span></p></button>
              </section>

              <RenewalCountdown deal={deal} searchRows={(props.dealSearch ?? []).filter((row) => row.home_id === home?.id)} onCompare={() => choose("rates")} />
              <TermNote deal={deal} onEdit={() => deal && setModal({ type: "edit_mortgage", deal })} />

              <section className="overflow-hidden rounded-[18px] border border-slate-200 bg-white">
                <div className={showMaps && home?.latitude && home?.longitude ? "grid lg:grid-cols-[1fr_1fr]" : ""}>
                  <div className="p-5 sm:p-6">
                    <h2 className="text-xl font-bold">{home?.label || "Add your home"}</h2>
                    {home?.full_address || home?.address_line ? <p className="mt-1 text-sm text-slate-500">{home?.full_address || home?.address_line}</p> : null}
                    <dl className="mt-5 divide-y divide-slate-100 text-sm">
                      <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-slate-500">Lender</dt><dd className="font-semibold">{deal ? [deal.lender, deal.product_name].filter(Boolean).join(" · ") || "—" : "No mortgage added"}</dd></div>
                      {deal ? <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-slate-500">Rate</dt><dd className="font-semibold">{Number(deal.interest_rate).toFixed(2)}%</dd></div> : null}
                      {(deal as any)?.initial_period_end ? <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-slate-500">Deal ends</dt><dd className="font-semibold">{new Date(`${(deal as any).initial_period_end}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</dd></div> : null}
                      <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-slate-500">Equity</dt><dd className="font-semibold">{formatMoney(Math.max(0, value.mid - mortgage.balance))}</dd></div>
                      {bankRate ? <div className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-slate-500">Bank of England rate</dt><dd className="font-semibold">{bankRate.toFixed(2)}%{benchmark ? <span className="font-normal text-slate-500"> · typical 2-year fix {Number(benchmark.rate_percent).toFixed(2)}%</span> : null}</dd></div> : null}
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button onClick={() => setModal(deal ? { type: "edit_mortgage", deal } : { type: "add_mortgage", homeId: home?.id })} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white">{deal ? "Edit mortgage" : "Add mortgage"}</button>
                      <button onClick={() => setModal(home ? { type: "edit_home", home } : { type: "add_home" })} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold">{home ? "Edit home" : "Add home"}</button>
                      <button onClick={() => choose("rates")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold">Compare rates</button>
                    </div>
                  </div>
                  {showMaps && home?.latitude && home?.longitude ? (
                    <div className="relative min-h-[260px] bg-slate-100">
                      <iframe title={`${home.label} map`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(home.longitude)-0.006}%2C${Number(home.latitude)-0.006}%2C${Number(home.longitude)+0.006}%2C${Number(home.latitude)+0.006}&layer=mapnik&marker=${home.latitude}%2C${home.longitude}`} className="absolute inset-0 h-full w-full border-0" loading="lazy"/>
                    </div>
                  ) : null}
                </div>
              </section>
              <MortgageFacts deal={deal} />
              <section className="grid gap-4 lg:grid-cols-2">
                <RunningCosts items={props.normalMonthPlan.outgoingItems.map((item) => ({ label: item.label, value: Number(item.value || 0) }))} />
                <AreaPriceCard data={props.areaPrices ?? null} homeValue={value.mid} valuationLabel={props.valuations.filter((v) => v.home_id === home?.id)[0]?.source_name ?? null} />
              </section>
              <section className="grid gap-4 lg:grid-cols-2">
                <DealHistory deals={props.deals.filter((item) => item.home_id === home?.id)} onEdit={(item) => setModal({ type: "edit_mortgage", deal: item })} />
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Valuation sources</h2><button onClick={() => setModal({ type: "add_valuation", homeId: home?.id })} className="text-xs font-bold text-violet-700">+ Add valuation</button></div><div className="mt-4 space-y-2">{props.valuations.filter(v => v.home_id === home?.id).map(v => <button key={v.id} onClick={() => setModal({ type: "edit_valuation", valuation: v })} className="flex w-full items-center justify-between rounded-xl bg-slate-50 p-3 text-left"><span><span className="block text-sm font-bold">{v.source_name}</span><span className="text-xs text-slate-500">{v.valuation_date}</span></span><span className="font-bold">{formatMoney(Number(v.valuation_mid ?? v.valuation_amount ?? 0))}</span></button>)}</div></section>
              </section>
            </div>
          ) : null}


          {tab === "rates" ? <div className="mx-auto max-w-none space-y-5"><WeeklyDealSearch homeId={home?.id ?? null} rows={(props.dealSearch ?? []).filter((row) => row.home_id === home?.id)} currentLender={deal?.lender ?? null} balance={renewalPoint.balance} monthsLeft={renewalPoint.monthsLeft} /><MortgageMarketReference bankRate={bankRate > 0 ? bankRate : null} fixedTwoYear={benchmark ? Number(benchmark.rate_percent) : null} fixedFiveYear={fiveYearBenchmark ? Number(fiveYearBenchmark.rate_percent) : null} ltv={Number.isFinite(ltv) && ltv > 0 ? ltv : null} liveDealCount={props.marketDeals.filter((item) => Number(item.rate_percent || 0) > 0).length} news={props.mortgageNews ?? []} /><HouseWorkspaceOverview homes={props.homes} deals={props.deals} valuations={props.valuations} renewalRecommendations={props.renewalRecommendations} marketDeals={props.marketDeals} moveQueries={props.moveQueries} boeBenchmarks={props.boeBenchmarks}/></div> : null}

          {tab === "moving" ? (
            <div className="mx-auto max-w-none">
              <AffordabilityPlanningPanel
                currentScore={currentAffordability}
                normalScore={normalAffordability}
                hasTemporaryIncome={hasTemporaryIncome}
                temporaryIncomeContext={props.temporaryIncomeContext}
                currentMonthlyNetIncome={Number(props.monthPlan.income || 0)}
                normalMonthlyNetIncome={Number(props.normalMonthPlan.income || 0)}
                currentGrossHouseholdIncome={props.currentGrossHouseholdIncome}
                normalGrossHouseholdIncome={props.normalGrossHouseholdIncome}
                propertyValue={value.mid}
                mortgageBalance={mortgage.balance}
                fixedExMortgage={fixedExMortgage}
                childMonthly={childMonthly}
                interestRate={Number(benchmark?.rate_percent || deal?.interest_rate || 4.75)}
                termYears={Number(deal?.term_years || 30)}
              />
            </div>
          ) : null}

          {tab === "overpayments" ? (
            <div className="mx-auto w-full max-w-none"><MortgageOverpaymentPlanner deal={deal} currentBalance={mortgage.balance} currentPayment={mortgage.payment} benchmarkRate={planningRate} /></div>
          ) : null}

          {tab === "moving" ? (
            <div className="mx-auto max-w-none space-y-5">
              <section className="grid gap-3 md:grid-cols-2">
                {props.moveQueries.map((query) => {
                  const currentScore = moveScenarioScore(
                    query,
                    props.monthPlan,
                    props.emergencySavings,
                  );
                  const normalScore = hasTemporaryIncome
                    ? moveScenarioScore(
                        query,
                        props.normalMonthPlan,
                        props.emergencySavings,
                      )
                    : null;
                  const sourceLabel = moveSourceLabel(query.property_url);
                  const displayedScore =
                    currentScore?.score ??
                    (query.affordability_score == null
                      ? null
                      : Number(query.affordability_score));

                  return (
                    <article
                      key={query.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="font-bold">
                            {query.address_hint ||
                              query.title ||
                              "Move scenario"}
                          </h2>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            {query.postcode ? <span>{query.postcode}</span> : null}
                            {sourceLabel ? (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                                {sourceLabel}
                                {query.source_confidence
                                  ? ` · ${Number(query.source_confidence).toFixed(0)}% source confidence`
                                  : ""}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {displayedScore !== null ? (
                          <button
                            type="button"
                            onClick={() =>
                              setModal({ type: "move_score", query })
                            }
                            className="shrink-0 rounded-2xl bg-violet-50 px-3 py-2 text-left text-violet-700 transition hover:bg-violet-100"
                            title="See why this move scores this way"
                          >
                            <span className="block text-sm font-bold">
                              {displayedScore}/100
                            </span>
                            <span className="block text-[9px] font-bold uppercase tracking-wide">
                              Why?
                            </span>
                          </button>
                        ) : (
                          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-500">
                            Needs scoring
                          </span>
                        )}
                      </div>

                      {query.property_url ? (
                        <a
                          href={query.property_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:underline"
                        >
                          Open {sourceLabel || "original"} listing ↗
                        </a>
                      ) : null}

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[10px] text-slate-400">Asking price</p>
                          <p className="font-bold">
                            {formatMoney(Number(query.asking_price || 0))}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[10px] text-slate-400">Mortgage est.</p>
                          <p className="font-bold">
                            {formatMoney(Number(query.expected_payment || 0))}/mo
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[10px] text-slate-400">Stamp duty</p>
                          <p className="font-bold">
                            {formatMoney(Number(query.stamp_duty_estimate || 0))}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-[10px] text-slate-400">Moving costs</p>
                          <p className="font-bold">
                            {formatMoney(Number(query.moving_cost_estimate || 0))}
                          </p>
                        </div>
                      </div>

                      {currentScore ? (
                        <button
                          type="button"
                          onClick={() => setModal({ type: "move_score", query })}
                          className="mt-4 w-full rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2.5 text-left text-xs font-semibold text-slate-600"
                        >
                          Household impact:{" "}
                          <strong className="text-violet-700">
                            {currentScore.score}/100 {currentScore.label}
                          </strong>
                          {normalScore ? (
                            <>
                              {" "}· after temporary income change{" "}
                              <strong className="text-violet-700">
                                {normalScore.score}/100
                              </strong>
                            </>
                          ) : null}
                          <span className="float-right font-bold text-violet-700">
                            Explain →
                          </span>
                        </button>
                      ) : null}

                      <form action={archivePropertyMoveQuery} className="mt-4">
                        <input type="hidden" name="id" value={query.id} />
                        <button className="text-xs font-bold text-rose-600">
                          Archive scenario
                        </button>
                      </form>
                    </article>
                  );
                })}
              </section>
            </div>
          ) : null}
        </div>
      </div>

      {modal ? (
        <ModalFrame title={modal.type === "add_home" ? "Add property" : modal.type === "edit_home" ? "Edit property" : modal.type === "add_mortgage" ? "Add mortgage" : modal.type === "edit_mortgage" ? "Edit mortgage" : modal.type === "add_valuation" ? "Add valuation" : modal.type === "edit_valuation" ? "Edit valuation" : modal.type === "move_score" ? "Why this move scores this way" : "Add move scenario"} onClose={() => setModal(null)}>
          {modal.type === "add_home" ? <HomeWizard people={props.people} owners={props.owners} action={addHome}/> : null}
          {modal.type === "edit_home" ? <><HomeWizard people={props.people} owners={props.owners} home={modal.home} action={updateHome}/><form action={deleteHome} className="mt-4"><input type="hidden" name="id" value={modal.home.id}/><button className="text-xs font-bold text-rose-600">Delete property</button></form></> : null}
          {modal.type === "add_mortgage" ? <MortgageWizard homes={props.homes} people={props.people} allocations={props.liabilityAllocations} homeId={modal.homeId} action={addHomeMortgageDeal}/> : null}
          {modal.type === "edit_mortgage" ? <><MortgageWizard homes={props.homes} people={props.people} allocations={props.liabilityAllocations} deal={modal.deal} action={updateHomeMortgageDeal}/><form action={deleteHomeMortgageDeal} className="mt-4"><input type="hidden" name="id" value={modal.deal.id}/><button className="text-xs font-bold text-rose-600">Delete mortgage</button></form></> : null}
          {modal.type === "add_valuation" ? <ValuationWizard homes={props.homes} homeId={modal.homeId} action={addHomeValuationSource}/> : null}
          {modal.type === "edit_valuation" ? <><ValuationWizard homes={props.homes} valuation={modal.valuation} action={updateHomeValuationSource}/><form action={deleteHomeValuationSource} className="mt-4"><input type="hidden" name="id" value={modal.valuation.id}/><button className="text-xs font-bold text-rose-600">Delete valuation</button></form></> : null}
          {modal.type === "move_score" ? (
            <div className="space-y-5">
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">
                      Saved move
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-slate-950">
                      {modal.query.address_hint ||
                        modal.query.title ||
                        "Move scenario"}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {modal.query.postcode}
                    </p>
                  </div>
                  {selectedMoveScore ? (
                    <div className={`rounded-2xl px-4 py-3 ring-1 ${selectedMoveScore.tone}`}>
                      <p className="text-[10px] font-bold uppercase">Right now</p>
                      <p className="text-2xl font-bold">
                        {selectedMoveScore.score}/100
                      </p>
                      <p className="text-xs font-bold">{selectedMoveScore.label}</p>
                    </div>
                  ) : null}
                </div>

                {modal.query.property_url ? (
                  <a
                    href={modal.query.property_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-xs font-bold text-violet-700 hover:underline"
                  >
                    Open {moveSourceLabel(modal.query.property_url) || "original"} listing ↗
                  </a>
                ) : null}
              </div>

              {selectedMoveNormalScore ? (
                <div className={`rounded-2xl p-4 ring-1 ${selectedMoveNormalScore.tone}`}>
                  <p className="text-[10px] font-bold uppercase">
                    After temporary income change
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {selectedMoveNormalScore.score}/100
                  </p>
                  <p className="text-xs font-bold">
                    {selectedMoveNormalScore.label}
                  </p>
                </div>
              ) : null}

              {selectedMoveScore ? (
                <div className="space-y-2">
                  {selectedMoveScore.criteria.map((criterion) => (
                    <details
                      key={criterion.label}
                      className="rounded-xl border border-slate-200 bg-white"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            {criterion.label}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {criterion.reason}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-bold">
                          {criterion.points}/{criterion.max}
                        </span>
                      </summary>
                      <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            What it means
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {criterion.explanation}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            How it is scored
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {criterion.scoring}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            What improves it
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {criterion.improve}
                          </p>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                  LOOP does not yet have enough mortgage/payment data on this saved
                  scenario to justify an affordability score. Open the listing or edit
                  the move assumptions first.
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] uppercase text-slate-400">Asking price</p>
                  <p className="font-bold">
                    {formatMoney(Number(modal.query.asking_price || 0))}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] uppercase text-slate-400">Mortgage estimate</p>
                  <p className="font-bold">
                    {formatMoney(Number(modal.query.expected_payment || 0))}/mo
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {modal.type === "add_move" ? <MoveQueryWizard homes={props.homes}/> : null}
        </ModalFrame>
      ) : null}
    </main>
  );
}
