"use client";

import { useMemo, useState } from "react";
import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";
import { formatMoney } from "@/lib/format/money";
import type {
  Home,
  HomeMortgageDeal,
  HomeValuationSource,
  MarketRateBenchmark,
  MortgageMarketDeal,
  MortgageRenewalRecommendation,
  PropertyMoveQuery,
} from "@/components/mortgage/MortgagePlannerClient";

type Props = {
  homes: Home[];
  deals: HomeMortgageDeal[];
  valuations: HomeValuationSource[];
  renewalRecommendations: MortgageRenewalRecommendation[];
  marketDeals: MortgageMarketDeal[];
  moveQueries: PropertyMoveQuery[];
  boeBenchmarks: MarketRateBenchmark[];
};

type ScenarioCardProps = {
  eyebrow: string;
  title: string;
  rate: number;
  payment: number;
  helper: string;
  delta?: number | null;
  tone?: "current" | "loop" | "quote";
};

function money(value: number) {
  return formatMoney(Number.isFinite(value) ? value : 0);
}

function monthlyPayment(balance: number, rate: number, termYears: number) {
  if (!balance || !rate || !termYears) return 0;
  return calculateMonthlyMortgagePayment({
    balance,
    annualInterestRate: rate,
    termYears,
  });
}

function valuationMid(home: Home | undefined, valuations: HomeValuationSource[]) {
  if (!home) return 0;
  const attached = valuations.filter((item) => item.home_id === home.id);
  const sourceValues = attached
    .map((item) => Number(item.valuation_mid ?? item.valuation_amount ?? 0))
    .filter((value) => value > 0);

  if (home.estimated_value_mid) return Number(home.estimated_value_mid);

  if (sourceValues.length) {
    return sourceValues.reduce((sum, value) => sum + value, 0) / sourceValues.length;
  }

  return Number(home.property_value || 0);
}

function remainingTermLabel(termYears: number) {
  const years = Math.max(0, Math.round(termYears));
  return `${years} year${years === 1 ? "" : "s"}`;
}

function ScenarioCard({
  eyebrow,
  title,
  rate,
  payment,
  helper,
  delta = null,
  tone = "current",
}: ScenarioCardProps) {
  const toneClass =
    tone === "loop"
      ? "border-emerald-100 bg-gradient-to-b from-emerald-50/80 to-white"
      : tone === "quote"
        ? "border-violet-100 bg-gradient-to-b from-violet-50/80 to-white"
        : "border-slate-200 bg-white";

  const badgeClass =
    tone === "loop"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "quote"
        ? "bg-violet-50 text-violet-700 ring-violet-200"
        : "bg-blue-50 text-blue-700 ring-blue-200";

  return (
    <article className={`w-[84vw] max-w-[390px] shrink-0 snap-center rounded-[1.4rem] border p-4 shadow-sm sm:p-5 md:w-auto md:max-w-none md:shrink ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ring-1 ${badgeClass}`}
        >
          {eyebrow}
        </span>
        <span className="text-lg font-bold leading-none text-slate-300">•••</span>
      </div>

      <p className="mt-3 text-center text-sm font-bold text-slate-500 sm:mt-5">{title}</p>
      <p className="mt-1 text-center text-[2.15rem] font-bold tracking-tight text-slate-950">
        {rate > 0 ? rate.toFixed(2) : "—"}
        <span className="text-lg">%</span>
      </p>
      <p className="mt-1 text-center text-xs font-semibold text-slate-400">{helper}</p>

      <div className="mt-4 border-t border-slate-100 pt-4 text-center sm:mt-6 sm:pt-5">
        <p className="text-3xl font-bold tracking-tight text-slate-950">
          {payment > 0 ? money(payment) : "—"}
          <span className="ml-1 text-xs font-bold text-slate-500">/month</span>
        </p>

        {delta !== null ? (
          <p
            className={`mt-2 text-xs font-bold ${
              delta < 0
                ? "text-emerald-700"
                : delta > 0
                  ? "text-rose-600"
                  : "text-slate-400"
            }`}
          >
            {delta === 0
              ? "Same monthly payment"
              : `${money(Math.abs(delta))} ${delta < 0 ? "less" : "more"} per month`}
          </p>
        ) : (
          <p className="mt-2 text-xs font-bold text-slate-400">Current monthly payment</p>
        )}
      </div>

      <a
        href="/mortgage/advanced"
        className="mt-5 block rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-xs font-bold text-violet-700 transition hover:border-violet-200 hover:bg-violet-50"
      >
        View details ↓
      </a>
    </article>
  );
}

export function HouseWorkspaceOverview({
  homes,
  deals,
  valuations,
  renewalRecommendations,
  marketDeals,
  moveQueries,
  boeBenchmarks,
}: Props) {
  const currentHome =
    homes.find((home) => home.ownership_status === "current_home") ?? homes[0];

  const currentDeal =
    deals.find((deal) => deal.home_id === currentHome?.id) ?? deals[0];

  const [quoteUrl, setQuoteUrl] = useState("");
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState<string | null>(null);

  const summary = useMemo(() => {
    const homeValue = valuationMid(currentHome, valuations);
    const balance = Number(currentDeal?.balance || 0);
    const rate = Number(currentDeal?.interest_rate || 0);
    const termYears = Number(currentDeal?.term_years || 25);

    const currentPayment =
      Number(currentDeal?.monthly_payment_override || 0) ||
      monthlyPayment(balance, rate, termYears);

    const ltv = homeValue > 0 ? (balance / homeValue) * 100 : 0;

    const fixedBenchmarks = boeBenchmarks
      .filter((item) => item.term_type === "2yr_fixed" && Number(item.rate_percent) > 0)
      .sort(
        (a, b) =>
          Number(a.ltv_tier ?? 100) - Number(b.ltv_tier ?? 100),
      );

    const eligibleBenchmark =
      fixedBenchmarks.find((item) => Number(item.ltv_tier ?? 100) >= ltv) ??
      fixedBenchmarks.at(-1);

    const loopRate = Number(eligibleBenchmark?.rate_percent || 0);
    const loopPayment =
      loopRate > 0 ? monthlyPayment(balance, loopRate, termYears) : 0;

    const eligibleMarket = marketDeals
      .filter((item) => Number(item.rate_percent || 0) > 0)
      .filter((item) => item.ltv_max == null || Number(item.ltv_max) >= ltv)
      .sort(
        (a, b) =>
          Number(a.rate_percent || 99) - Number(b.rate_percent || 99),
      );

    const bestRecommendation = renewalRecommendations
      .filter((item) => Number(item.suggested_rate || 0) > 0)
      .sort(
        (a, b) =>
          Number(a.suggested_rate || 99) - Number(b.suggested_rate || 99),
      )[0];

    const bestMarket = eligibleMarket[0];
    const quoteRate = Number(
      bestRecommendation?.suggested_rate || bestMarket?.rate_percent || 0,
    );
    const quoteFee = Number(
      bestRecommendation?.product_fee || bestMarket?.product_fee || 0,
    );

    const quotePayment =
      Number(bestRecommendation?.estimated_new_payment || 0) ||
      (quoteRate > 0
        ? monthlyPayment(balance, quoteRate, termYears)
        : 0);

    const quoteLender =
      bestRecommendation?.lender_name ||
      bestMarket?.lender_name ||
      "Best current comparison";

    const quoteProduct =
      bestRecommendation?.product_name ||
      bestMarket?.product_name ||
      "Eligible sourced deal";

    const effectiveDates = boeBenchmarks
      .map((item) => item.effective_month)
      .filter(Boolean)
      .sort()
      .reverse();

    return {
      homeValue,
      balance,
      rate,
      termYears,
      currentPayment,
      ltv,
      loopRate,
      loopPayment,
      quoteRate,
      quoteFee,
      quotePayment,
      quoteLender,
      quoteProduct,
      benchmarkDate: effectiveDates[0] || null,
    };
  }, [
    boeBenchmarks,
    currentDeal,
    currentHome,
    marketDeals,
    renewalRecommendations,
    valuations,
  ]);

  const loopDelta =
    summary.loopPayment > 0
      ? summary.loopPayment - summary.currentPayment
      : null;

  const quoteDelta =
    summary.quotePayment > 0
      ? summary.quotePayment - summary.currentPayment
      : null;

  const currentTwoYearCost = summary.currentPayment * 24;
  const loopTwoYearCost = summary.loopPayment * 24;
  const quoteTwoYearCost = summary.quotePayment * 24 + summary.quoteFee;

  const bestSaving = Math.max(
    0,
    currentTwoYearCost -
      Math.min(
        loopTwoYearCost || currentTwoYearCost,
        quoteTwoYearCost || currentTwoYearCost,
      ),
  );

  async function importQuote() {
    if (!quoteUrl.trim() || !currentHome) return;

    setQuoteBusy(true);
    setQuoteMessage(null);

    try {
      const response = await fetch("/api/house/mortgage/import-product-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: quoteUrl.trim(),
          homeId: currentHome.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Could not import that quote");
      }

      const lender = data?.product?.lender_name || "Lender quote";
      const importedRate = data?.product?.rate_percent;

      setQuoteMessage(
        `${lender}${importedRate ? ` · ${importedRate}%` : ""} imported. Open the full workspace below to shortlist or compare it.`,
      );
    } catch (error) {
      setQuoteMessage(
        error instanceof Error ? error.message : "Could not import that quote",
      );
    } finally {
      setQuoteBusy(false);
    }
  }

  if (!currentHome && !currentDeal) return null;

  return (
    <main className="w-full min-w-0">
      <div className="min-w-0">
        <aside className="hidden">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              House
            </p>

            {[
              ["Overview", "/mortgage"],
              ["Property", "/mortgage/property"],
              ["Mortgage & rates", "/mortgage/rates"],
              ["Affordability", "/affordability"],
              ["Moving costs", "/mortgage/moving-costs"],
            ].map(([label, href], index) => (
              <a
                key={label}
                href={href}
                className={`mb-1 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                  index === 2
                    ? "bg-violet-50 text-violet-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="w-5 text-center text-xs">
                  {index === 2 ? "⌂" : "○"}
                </span>
                {label}
              </a>
            ))}

            <div className="my-3 border-t border-slate-100" />

            <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Quick actions
            </p>
            <a
              href="/mortgage/advanced"
              className="mt-1 block rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              ＋ Add property
            </a>
            <a
              href="/mortgage/advanced"
              className="block rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              ▣ Add mortgage
            </a>
            <a
              href="/mortgage/advanced"
              className="block rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              ⇄ Compare rates
            </a>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          <section id="house-scenario-overview">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                  Mortgage rate scenarios
                </h1>
                <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
                  Compare your current mortgage with LOOP&apos;s market benchmark
                  and the best eligible sourced deal before you change anything.
                </p>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-xs font-bold text-emerald-700">
                  ● BoE data {summary.benchmarkDate ? "loaded" : "pending"}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {summary.benchmarkDate || "Waiting for rate benchmark"}
                </p>
                <a
                  href="/mortgage/advanced"
                  className="mt-3 inline-block rounded-xl border border-violet-300 bg-white px-4 py-2 text-xs font-bold text-violet-700"
                >
                  Adjust assumptions
                </a>
              </div>
            </div>
          </section>

          <section
            id="house-property-summary"
            className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-4"
          >
            {[
              ["Mortgage balance", money(summary.balance)],
              ["LTV", summary.ltv > 0 ? `${summary.ltv.toFixed(0)}%` : "—"],
              ["Remaining term", remainingTermLabel(summary.termYears)],
              [
                "Repayment type",
                String(currentDeal?.repayment_type || "Repayment").replaceAll(
                  "_",
                  " ",
                ),
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border-slate-100 px-3 py-2 sm:border-r sm:last:border-r-0"
              >
                <p className="text-[11px] font-bold text-slate-500">{label}</p>
                <p className="mt-0.5 text-sm font-bold capitalize text-slate-950 sm:text-base">
                  {value}
                </p>
              </div>
            ))}
          </section>

          <section className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
            <ScenarioCard
              eyebrow="Current mortgage"
              title={`${currentDeal?.lender || "Current lender"}${
                currentDeal?.product_name ? ` · ${currentDeal.product_name}` : ""
              }`}
              rate={summary.rate}
              payment={summary.currentPayment}
              helper={
                currentDeal?.initial_period_end
                  ? `Fixed / initial period until ${currentDeal.initial_period_end}`
                  : "Current stored mortgage"
              }
            />

            <ScenarioCard
              eyebrow="LOOP estimate"
              title="BoE-based 2-year fixed benchmark"
              rate={summary.loopRate}
              payment={summary.loopPayment}
              helper={
                summary.ltv > 0
                  ? `Indicative for your ${summary.ltv.toFixed(0)}% LTV band`
                  : "Indicative benchmark"
              }
              delta={loopDelta}
              tone="loop"
            />

            <ScenarioCard
              eyebrow="Best sourced deal"
              title={`${summary.quoteLender} · ${summary.quoteProduct}`}
              rate={summary.quoteRate}
              payment={summary.quotePayment}
              helper={
                summary.quoteFee > 0
                  ? `${money(summary.quoteFee)} product fee`
                  : "No product fee recorded"
              }
              delta={quoteDelta}
              tone="quote"
            />
          </section>

          <section className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr] lg:items-center">
              <div>
                <p className="text-base font-bold text-violet-800">
                  Add a lender quote
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Paste a lender product URL and LOOP will extract the rate, LTV,
                  term and fees so it can be compared with your live mortgage.
                </p>
              </div>

              <div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={quoteUrl}
                    onChange={(event) => setQuoteUrl(event.target.value)}
                    placeholder="Paste lender product URL"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none ring-violet-300 focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={importQuote}
                    disabled={quoteBusy || !quoteUrl.trim()}
                    className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
                  >
                    {quoteBusy ? "Checking…" : "Import quote"}
                  </button>
                </div>

                {quoteMessage ? (
                  <p className="mt-2 text-xs font-bold text-slate-600">
                    {quoteMessage}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.5fr_.75fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    Cost comparison
                  </p>
                  <p className="text-xs font-semibold text-slate-400">
                    Illustrative cost over 2 years
                  </p>
                </div>
                <a
                  href="/mortgage/advanced"
                  className="text-xs font-bold text-violet-700"
                >
                  View full breakdown →
                </a>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2"> </th>
                      <th>Current</th>
                      <th>LOOP estimate</th>
                      <th>Best sourced</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    <tr>
                      <td className="py-3 text-slate-500">Monthly payment</td>
                      <td>{money(summary.currentPayment)}</td>
                      <td>
                        {summary.loopPayment ? money(summary.loopPayment) : "—"}
                      </td>
                      <td>
                        {summary.quotePayment ? money(summary.quotePayment) : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 text-slate-500">Monthly difference</td>
                      <td>—</td>
                      <td
                        className={
                          loopDelta !== null && loopDelta < 0
                            ? "text-emerald-700"
                            : ""
                        }
                      >
                        {loopDelta === null
                          ? "—"
                          : `${loopDelta < 0 ? "−" : "+"}${money(
                              Math.abs(loopDelta),
                            )}`}
                      </td>
                      <td
                        className={
                          quoteDelta !== null && quoteDelta < 0
                            ? "text-emerald-700"
                            : ""
                        }
                      >
                        {quoteDelta === null
                          ? "—"
                          : `${quoteDelta < 0 ? "−" : "+"}${money(
                              Math.abs(quoteDelta),
                            )}`}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 text-slate-500">Total over 2 years</td>
                      <td>{money(currentTwoYearCost)}</td>
                      <td>
                        {summary.loopPayment ? money(loopTwoYearCost) : "—"}
                      </td>
                      <td>
                        {summary.quotePayment ? money(quoteTwoYearCost) : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 text-slate-500">Product fee</td>
                      <td>Stored separately</td>
                      <td>Benchmark only</td>
                      <td>{money(summary.quoteFee)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">
                Best current comparison
              </p>

              <p className="mt-4 text-3xl font-bold tracking-tight text-emerald-700">
                {quoteDelta !== null && quoteDelta < 0
                  ? `${money(Math.abs(quoteDelta))} less`
                  : bestSaving > 0
                    ? `${money(bestSaving)} saved`
                    : "Compare now"}
              </p>

              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {quoteDelta !== null && quoteDelta < 0
                  ? "each month versus your current stored mortgage"
                  : "Open the full workspace to inspect eligibility, fees and alternatives."}
              </p>

              <div className="mt-5 rounded-xl bg-emerald-50 p-4">
                <p className="text-[11px] font-bold text-emerald-800">
                  Estimated saving over 2 years
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-800">
                  {bestSaving > 0 ? money(bestSaving) : "—"}
                </p>
                <p className="text-[10px] font-semibold text-emerald-700">
                  Before any ERC and costs not stored in the catalogue.
                </p>
              </div>

              <a
                href="/mortgage/advanced"
                className="mt-4 block rounded-xl border border-violet-300 px-4 py-2.5 text-center text-xs font-bold text-violet-700"
              >
                View full breakdown
              </a>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase text-slate-400">
                Home value
              </p>
              <p className="mt-1 text-xl font-bold text-slate-950">
                {money(summary.homeValue)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase text-slate-400">
                Saved move searches
              </p>
              <p className="mt-1 text-xl font-bold text-slate-950">
                {moveQueries.length}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase text-slate-400">
                Property
              </p>
              <p className="mt-1 truncate text-xl font-bold text-slate-950">
                {currentHome?.label || "Current home"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
