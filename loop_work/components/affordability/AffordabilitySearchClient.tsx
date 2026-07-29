"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bot, Car, CheckCircle2, Home, Loader2, Search, Sparkles, Tv } from "lucide-react";
import { formatMoney } from "@/lib/format/money";
import { addAffordabilityScenario } from "@/app/affordability/actions";
import { SubmitButton } from "@/components/SubmitButton";

type Scenario = {
  id: string;
  label: string;
  purchase_price: number;
  deposit_cash: number;
  current_property_sale_price: number;
  current_mortgage_balance: number;
  gross_household_income: number;
  monthly_fixed_costs: number;
  monthly_childcare: number;
  interest_rate: number;
  stress_rate: number;
  term_years: number;
  arrangement_and_moving_costs: number;
  affordability_score?: string | null;
  monthly_buffer?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

type Context = {
  currentGrossIncome: number;
  currentNetMonthlyIncome: number;
  currentChildcare: number;
  fixedCosts: number;
  debtPayments: number;
  carFinance: number;
  studentLoans: number;
  currentMortgagePayment: number;
  currentMortgageBalance: number;
  currentPropertyValue: number;
  dependantChildren: number;
  dependantAdults: number;
};

type MortgageProduct = {
  lender: string;
  productName: string;
  rate: number;
  rateType: string;
  maxLtv: number;
  productFee: number;
  termYears: number;
  monthlyPayment: number;
  stressedPayment: number;
  totalInitialPeriodCost?: number;
  notes: string;
  sourceName?: string;
  sourceUrl?: string;
  refreshedAt?: string;
};

type LenderCheck = {
  lender: string;
  style: string;
  includedCosts: string[];
  resultLabel: string;
  estimatedMaxBorrowing: number;
  affordabilityGap: number;
  monthlyDeductionsUsed: number;
  notes: string;
  sourceName?: string;
  sourceUrl?: string;
};

type MortgageBreakdown = {
  loanRequired: number;
  ltv: number;
  estimatedEquityUsed: number;
  currentMortgageExcludedFromScore: boolean;
  incomeMultiple: number;
  netMonthlyIncome: number;
  monthlyCommittedBeforeNewMortgage: number;
  newMortgagePayment: number;
  stressedNewMortgagePayment: number;
  bufferAfterNewMortgage: number;
  bufferAfterStress: number;
  paymentToNetIncomePercent: number;
  stressedPaymentToNetIncomePercent: number;
};

type ResearchSource = { name: string; url: string; note: string };

type CoachResult = {
  title: string;
  itemType: "house" | "car" | "tv" | "holiday" | "other";
  summary: string;
  questions: string[];
  assumptions: string[];
  score: string;
  scoreLabel: string;
  mortgageBreakdown?: MortgageBreakdown | null;
  mortgageProducts?: MortgageProduct[];
  lenderChecks?: LenderCheck[];
  researchSources?: ResearchSource[];
  draftScenario: {
    label: string;
    purchase_price: number;
    deposit_cash: number;
    current_property_sale_price: number;
    current_mortgage_balance: number;
    gross_household_income: number;
    monthly_fixed_costs: number;
    monthly_childcare: number;
    interest_rate: number;
    stress_rate: number;
    term_years: number;
    arrangement_and_moving_costs: number;
    notes: string;
  };
};

const examples = ["a new car", "a bigger house", "a new TV", "a holiday", "a kitchen extension"];
const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";

function IconForType({ type }: { type: CoachResult["itemType"] }) {
  if (type === "car") return <Car className="h-5 w-5" />;
  if (type === "tv") return <Tv className="h-5 w-5" />;
  return <Home className="h-5 w-5" />;
}

function confidenceTone(score: string) {
  const value = Number(score || 0);
  if (value >= 75) return "bg-emerald-100 text-emerald-800";
  if (value >= 50) return "bg-amber-100 text-amber-900";
  return "bg-red-100 text-red-700";
}

function signedMoney(value: number) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : "-"}${formatMoney(Math.abs(number))}`;
}

function percent(value: number, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

function productTypeLabel(type: string) {
  return String(type || "rate").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AffordabilitySearchClient({ context, scenarios }: { context: Context; scenarios: Scenario[] }) {
  const [exampleIndex, setExampleIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openScenarioId, setOpenScenarioId] = useState<string | null>(scenarios[0]?.id ?? null);
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setExampleIndex((index) => (index + 1) % examples.length), 1700);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => setSelectedProductIndex(0), [result?.title]);

  const openScenario = useMemo(() => scenarios.find((scenario) => scenario.id === openScenarioId) ?? scenarios[0] ?? null, [openScenarioId, scenarios]);
  const selectedProduct = result?.mortgageProducts?.[selectedProductIndex] ?? result?.mortgageProducts?.[0] ?? null;
  const breakdown = result?.mortgageBreakdown ?? null;

  async function askCoach() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/affordability/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, context }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Affordability check failed");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Affordability check failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 p-8 text-white shadow-[0_30px_100px_-70px_rgba(15,23,42,.9)]">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-emerald-100"><Sparkles className="h-4 w-4" /> Affordability lab</div>
          <h1 className="mt-8 text-4xl font-black tracking-tight md:text-6xl">Can you afford</h1>
          <div className="mx-auto mt-5 flex max-w-3xl items-center gap-3 rounded-[2rem] border border-white/15 bg-white p-3 text-slate-950 shadow-2xl">
            <Search className="ml-2 h-6 w-6 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); askCoach(); } }}
              className="min-w-0 flex-1 bg-transparent px-2 py-3 text-lg font-black outline-none placeholder:text-slate-400"
              placeholder={examples[exampleIndex]}
            />
            <button type="button" onClick={askCoach} disabled={loading || !query.trim()} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Ask</button>
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-300">Try: “I want a bigger house around 550k”, “Can I afford a car on PCP at £420/month?” or “Can I buy a £900 TV?”</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Household gross</p><p className="mt-2 text-3xl font-black text-slate-950">{formatMoney(context.currentGrossIncome)}</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Net this month</p><p className="mt-2 text-3xl font-black text-slate-950">{formatMoney(context.currentNetMonthlyIncome)}</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Costs before mortgage</p><p className="mt-2 text-3xl font-black text-slate-950">{formatMoney(context.fixedCosts + context.debtPayments + context.carFinance + context.studentLoans)}</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Childcare</p><p className="mt-2 text-3xl font-black text-slate-950">{formatMoney(context.currentChildcare)}</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-slate-500">Current mortgage</p><p className="mt-2 text-3xl font-black text-slate-950">{formatMoney(context.currentMortgagePayment)}</p><p className="mt-1 text-xs font-black text-slate-400">not scored if replacing home</p></div>
      </section>

      {error ? <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-black text-red-700">{error}</div> : null}

      {result ? (
        <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <div className="space-y-5 rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white"><IconForType type={result.itemType} /></div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Conversation result</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{result.title}</h2>
                <p className="mt-2 text-sm font-semibold text-slate-600">{result.summary}</p>
              </div>
              <span className={`ml-auto rounded-full px-4 py-2 text-sm font-black ${confidenceTone(result.score)}`}>{result.scoreLabel}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Target</p><p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(result.draftScenario.purchase_price)}</p></div>
              <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Score</p><p className="mt-1 text-2xl font-black text-slate-950">{result.score}/100</p></div>
              <div className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Data used</p><p className="mt-1 text-sm font-black text-slate-950">Income, Financial Flow, childcare, dependants and mortgage data</p></div>
            </div>

            {breakdown ? (
              <div className="rounded-[2rem] border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Mortgage affordability maths</p>
                    <h3 className="mt-1 text-xl font-black text-slate-950">Current mortgage excluded unless kept as a second property</h3>
                  </div>
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-600">{breakdown.currentMortgageExcludedFromScore ? "replacement home" : "background property kept"}</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Loan required</p><p className="text-lg font-black text-slate-950">{formatMoney(breakdown.loanRequired)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">LTV / income multiple</p><p className="text-lg font-black text-slate-950">{percent(breakdown.ltv)} · {breakdown.incomeMultiple.toFixed(2)}x</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">New payment</p><p className="text-lg font-black text-slate-950">{formatMoney(selectedProduct?.monthlyPayment || breakdown.newMortgagePayment)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Stress payment</p><p className="text-lg font-black text-slate-950">{formatMoney(selectedProduct?.stressedPayment || breakdown.stressedNewMortgagePayment)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Committed before mortgage</p><p className="text-lg font-black text-slate-950">{formatMoney(breakdown.monthlyCommittedBeforeNewMortgage)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Buffer after new payment</p><p className={`text-lg font-black ${breakdown.bufferAfterNewMortgage >= 0 ? "text-emerald-700" : "text-red-700"}`}>{signedMoney(breakdown.bufferAfterNewMortgage)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Buffer after stress</p><p className={`text-lg font-black ${breakdown.bufferAfterStress >= 0 ? "text-emerald-700" : "text-red-700"}`}>{signedMoney(breakdown.bufferAfterStress)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Payment/net</p><p className="text-lg font-black text-slate-950">{percent(breakdown.paymentToNetIncomePercent)} / {percent(breakdown.stressedPaymentToNetIncomePercent)}</p></div>
                </div>
              </div>
            ) : null}

            {result.mortgageProducts?.length ? (
              <div className="rounded-[2rem] border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Rate options to test</p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {result.mortgageProducts.map((product, index) => (
                    <button key={`${product.lender}-${product.productName}-${index}`} type="button" onClick={() => setSelectedProductIndex(index)} className={`rounded-3xl border p-4 text-left transition ${selectedProductIndex === index ? "border-orange-300 shadow-[0_0_0_4px_rgba(251,146,60,.18)]" : "border-slate-200 hover:border-slate-300"}`}>
                      <div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-950">{product.lender}</p><p className="mt-1 text-sm font-bold text-slate-600">{product.productName}</p></div>{selectedProductIndex === index ? <CheckCircle2 className="h-5 w-5 text-orange-500" /> : null}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold text-slate-600"><span>{productTypeLabel(product.rateType)}</span><span>{Number(product.rate || 0).toFixed(2)}%</span><span>Max LTV</span><span>{Number(product.maxLtv || 0)}%</span><span>Fee</span><span>{formatMoney(product.productFee || 0)}</span><span>Monthly</span><span>{formatMoney(product.monthlyPayment || 0)}</span></div>
                      <p className="mt-3 text-xs font-semibold text-slate-500">{product.notes}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {result.lenderChecks?.length ? (
              <div className="rounded-[2rem] border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Provider-style affordability lenses</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {result.lenderChecks.map((check) => (
                    <div key={check.lender} className="rounded-3xl bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3"><p className="font-black text-slate-950">{check.lender}</p><span className={`rounded-full px-3 py-1 text-xs font-black ${check.affordabilityGap >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{check.resultLabel}</span></div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold text-slate-600"><span>Rough max</span><span>{formatMoney(check.estimatedMaxBorrowing)}</span><span>Gap</span><span>{signedMoney(check.affordabilityGap)}</span><span>Deductions used</span><span>{formatMoney(check.monthlyDeductionsUsed)}/mo</span></div>
                      <p className="mt-3 text-xs font-semibold text-slate-500">{check.notes}</p>
                      <p className="mt-2 text-xs font-black text-slate-400">Uses: {check.includedCosts.join(", ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 p-4"><p className="font-black text-slate-950">Questions to complete it</p><ul className="mt-2 space-y-2 text-sm font-semibold text-slate-600">{result.questions.map((question) => <li key={question}>• {question}</li>)}</ul></div>
              <div className="rounded-3xl border border-slate-200 p-4"><p className="font-black text-slate-950">Assumptions used</p><ul className="mt-2 space-y-2 text-sm font-semibold text-slate-600">{result.assumptions.map((assumption) => <li key={assumption}>• {assumption}</li>)}</ul></div>
            </div>
          </div>

          <form key={`${result.title}-${selectedProductIndex}`} action={addAffordabilityScenario} className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Save to log</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">Review and save scenario</h3>
            <input type="hidden" name="notes" value={result.draftScenario.notes} />
            <input type="hidden" name="request_text" value={query} />
            <input type="hidden" name="scenario_kind" value={result.itemType} />
            <input type="hidden" name="assistant_summary" value={result.summary} />
            <input type="hidden" name="affordability_score" value={`${result.score}/100 · ${result.scoreLabel}`} />
            <input type="hidden" name="questions_json" value={JSON.stringify(result.questions)} />
            <input type="hidden" name="assumptions_json" value={JSON.stringify(result.assumptions)} />
            <input type="hidden" name="answer_log" value={JSON.stringify(result)} />
            <input type="hidden" name="loan_required" value={breakdown?.loanRequired ?? 0} />
            <input type="hidden" name="ltv_percent" value={breakdown?.ltv ?? 0} />
            <input type="hidden" name="selected_lender" value={selectedProduct?.lender ?? ""} />
            <input type="hidden" name="selected_product_name" value={selectedProduct?.productName ?? ""} />
            <input type="hidden" name="selected_product_fee" value={selectedProduct?.productFee ?? 0} />
            <input type="hidden" name="selected_monthly_payment" value={selectedProduct?.monthlyPayment ?? breakdown?.newMortgagePayment ?? 0} />
            <input type="hidden" name="selected_stress_payment" value={selectedProduct?.stressedPayment ?? breakdown?.stressedNewMortgagePayment ?? 0} />
            <input type="hidden" name="lender_checks_json" value={JSON.stringify(result.lenderChecks || [])} />
            <input type="hidden" name="mortgage_products_json" value={JSON.stringify(result.mortgageProducts || [])} />
            <input type="hidden" name="monthly_buffer" value={breakdown?.bufferAfterNewMortgage ?? 0} />
            <div className="mt-4 grid gap-3">
              <label className="block"><span className="text-sm font-bold text-slate-700">Label</span><input name="label" defaultValue={result.draftScenario.label} className={inputClass} /></label>
              <label className="block"><span className="text-sm font-bold text-slate-700">Purchase / target price</span><input name="purchase_price" type="number" step="0.01" defaultValue={result.draftScenario.purchase_price} className={inputClass} /></label>
              <label className="block"><span className="text-sm font-bold text-slate-700">Deposit / upfront cash</span><input name="deposit_cash" type="number" step="0.01" defaultValue={result.draftScenario.deposit_cash} className={inputClass} /></label>
              <label className="block"><span className="text-sm font-bold text-slate-700">Current property sale price</span><input name="current_property_sale_price" type="number" step="0.01" defaultValue={result.draftScenario.current_property_sale_price} className={inputClass} /></label>
              <label className="block"><span className="text-sm font-bold text-slate-700">Current mortgage balance</span><input name="current_mortgage_balance" type="number" step="0.01" defaultValue={result.draftScenario.current_mortgage_balance} className={inputClass} /></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="text-sm font-bold text-slate-700">Interest/APR %</span><input name="interest_rate" type="number" step="0.001" defaultValue={selectedProduct?.rate ?? result.draftScenario.interest_rate} className={inputClass} /></label><label className="block"><span className="text-sm font-bold text-slate-700">Stress rate %</span><input name="stress_rate" type="number" step="0.001" defaultValue={result.draftScenario.stress_rate} className={inputClass} /></label></div>
              <input type="hidden" name="gross_household_income" value={result.draftScenario.gross_household_income} />
              <input type="hidden" name="monthly_fixed_costs" value={result.draftScenario.monthly_fixed_costs} />
              <input type="hidden" name="monthly_childcare" value={result.draftScenario.monthly_childcare} />
              <input type="hidden" name="term_years" value={result.draftScenario.term_years} />
              <input type="hidden" name="arrangement_and_moving_costs" value={result.draftScenario.arrangement_and_moving_costs} />
              <SubmitButton>Save affordability log</SubmitButton>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-white/70 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3"><Bot className="h-5 w-5 text-slate-500" /><div><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Previous logs</p><h2 className="text-2xl font-black text-slate-950">Affordability search history</h2></div></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
          <div className="space-y-2">
            {scenarios.map((scenario) => <button type="button" key={scenario.id} onClick={() => setOpenScenarioId(scenario.id)} className={`w-full rounded-3xl border px-4 py-3 text-left ${openScenario?.id === scenario.id ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-slate-50"}`}><p className="font-black text-slate-950">{scenario.label}</p><p className="text-sm font-semibold text-slate-500">{formatMoney(scenario.purchase_price)} · {scenario.affordability_score || "saved"}</p></button>)}
            {scenarios.length === 0 ? <p className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">No saved affordability logs yet.</p> : null}
          </div>
          {openScenario ? <div className="rounded-3xl border border-slate-200 p-5"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Opened log</p><h3 className="mt-1 text-xl font-black text-slate-950">{openScenario.label}</h3><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Target</p><p className="font-black">{formatMoney(openScenario.purchase_price)}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Deposit</p><p className="font-black">{formatMoney(openScenario.deposit_cash)}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Rate</p><p className="font-black">{Number(openScenario.interest_rate || 0).toFixed(2)}%</p></div></div><p className="mt-4 whitespace-pre-wrap text-sm font-semibold text-slate-600">{openScenario.notes || "No notes saved yet."}</p></div> : <div className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">Open a saved log to see its assumptions and figures.</div>}
        </div>
      </section>
    </div>
  );
}
