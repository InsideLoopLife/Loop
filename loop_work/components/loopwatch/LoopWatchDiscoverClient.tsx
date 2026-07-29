"use client";

import { useState, type FormEvent } from "react";
import { Car, CheckCircle2, Gauge, Home, Loader2, PiggyBank, Search, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import type { LoopWatchPerson } from "./LoopWatchUploadClient";

type Deal = {
  id?: string;
  title: string;
  provider?: string | null;
  source?: string | null;
  dealType: string;
  monthlyCost: number;
  upfrontCost: number;
  termMonths: number;
  annualMileage?: number | null;
  aprPercent?: number | null;
  score: number;
  affordabilityBand: "strong" | "workable" | "stretched" | "review";
  summary: string;
  impact: {
    monthlyDelta: number;
    leftoverAfterDeal: number | null;
    savingsImpact: number | null;
    houseAffordabilityNote: string;
    pensionNote: string;
  };
};

type DiscoverPayload = {
  ok?: boolean;
  workflow?: { id?: string; next_check_at?: string | null; cadence_days?: number | null; status?: string | null };
  shortlist?: Deal[];
  summary?: string;
  error?: string;
  source_mode?: string;
};

function currency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(value));
}

function bandClass(value: Deal["affordabilityBand"]) {
  if (value === "strong") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (value === "workable") return "bg-blue-50 text-blue-700 ring-blue-100";
  if (value === "stretched") return "bg-amber-50 text-amber-700 ring-amber-100";
  return "bg-red-50 text-red-700 ring-red-100";
}

export function LoopWatchDiscoverClient({ people }: { people: LoopWatchPerson[] }) {
  const [query, setQuery] = useState("Looking for a new car");
  const [ownerPersonId, setOwnerPersonId] = useState("");
  const [financeType, setFinanceType] = useState("lease_or_pcp");
  const [monthlyBudget, setMonthlyBudget] = useState("400");
  const [deposit, setDeposit] = useState("1500");
  const [termMonths, setTermMonths] = useState("36");
  const [annualMileage, setAnnualMileage] = useState("8000");
  const [fuelType, setFuelType] = useState("any");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [payload, setPayload] = useState<DiscoverPayload | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setPayload(null);
    try {
      const response = await fetch("/api/loopwatch/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          owner_person_id: ownerPersonId || null,
          workflow_type: "vehicle_purchase",
          finance_type: financeType,
          monthly_budget: Number(monthlyBudget || 0),
          deposit: Number(deposit || 0),
          term_months: Number(termMonths || 36),
          annual_mileage: Number(annualMileage || 8000),
          fuel_type: fuelType,
          notes,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "LoopWatch Discover could not start this workflow.");
      setPayload(json);
      setStatus("done");
    } catch (error: any) {
      setPayload({ error: String(error?.message || error || "Something went wrong.") });
      setStatus("error");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
        <form onSubmit={submit} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
            <Sparkles className="h-4 w-4" /> LoopWatch Discover
          </div>
          <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950">Search for a big purchase or deal workflow</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">Cars are first because lease/PCP decisions affect monthly bills, house affordability, savings and pension headroom.</p>

          <label className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Search className="h-5 w-5 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-950 outline-none" placeholder="e.g. looking for a new car" />
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Finance route</span><select value={financeType} onChange={(event) => setFinanceType(event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-950"><option value="lease_or_pcp">Show lease + PCP</option><option value="lease">Lease only</option><option value="pcp">PCP only</option><option value="cash_or_loan">Cash / loan comparison</option></select></label>
            <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Monthly budget</span><input value={monthlyBudget} onChange={(event) => setMonthlyBudget(event.target.value)} type="number" className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-950" /></label>
            <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Deposit / initial</span><input value={deposit} onChange={(event) => setDeposit(event.target.value)} type="number" className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-950" /></label>
            <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Term months</span><input value={termMonths} onChange={(event) => setTermMonths(event.target.value)} type="number" className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-950" /></label>
            <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Annual mileage</span><input value={annualMileage} onChange={(event) => setAnnualMileage(event.target.value)} type="number" className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-950" /></label>
            <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Fuel preference</span><select value={fuelType} onChange={(event) => setFuelType(event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-950"><option value="any">Any</option><option value="electric">Electric</option><option value="hybrid">Hybrid</option><option value="petrol">Petrol</option><option value="diesel">Diesel</option></select></label>
          </div>

          <label className="mt-3 block"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Context</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Family size, must-haves, current car cost, timeline, charging, boot space etc." className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400" /></label>

          {people.length ? (
            <div className="mt-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Owner</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setOwnerPersonId("")} className={`rounded-full px-3 py-2 text-xs font-black ring-1 ${ownerPersonId ? "bg-white text-slate-600 ring-slate-200" : "bg-slate-950 text-white ring-slate-950"}`}>Household</button>
                {people.map((person) => (
                  <button key={person.id} type="button" onClick={() => setOwnerPersonId(person.id)} className={`flex items-center gap-2 rounded-full px-2 py-1 pr-3 text-xs font-black ring-1 ${ownerPersonId === person.id ? "bg-orange-50 text-orange-800 ring-orange-200" : "bg-white text-slate-600 ring-slate-200"}`}>
                    <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-slate-950 text-[10px] text-white">
                      {person.avatar_url ? <img src={person.avatar_url} alt={person.name} className="h-full w-full object-cover" /> : person.name.slice(0, 2).toUpperCase()}
                    </span>
                    {person.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <button disabled={status === "loading"} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-xl shadow-slate-950/15 disabled:opacity-60" type="submit">
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Car className="h-4 w-4" />} Start deal watch
          </button>
        </form>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Shortlist and impact</p>
              <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Best deals LoopWatch can see</h3>
              <p className="mt-1 text-sm font-bold text-slate-500">Results are scored against monthly affordability, savings pressure, pension/headroom and house affordability impact.</p>
            </div>
            {payload?.workflow?.next_check_at ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">Next check {payload.workflow.next_check_at}</span> : null}
          </div>

          {status === "idle" ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"><WalletCards className="h-5 w-5 text-slate-500" /><p className="mt-2 text-sm font-black text-slate-950">Lease / PCP prompts</p><p className="mt-1 text-xs font-bold text-slate-500">Collect budget, term, mileage and deposit before searching.</p></div>
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"><Home className="h-5 w-5 text-slate-500" /><p className="mt-2 text-sm font-black text-slate-950">House affordability</p><p className="mt-1 text-xs font-bold text-slate-500">Shows the monthly commitment impact before you lock into a car.</p></div>
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"><PiggyBank className="h-5 w-5 text-slate-500" /><p className="mt-2 text-sm font-black text-slate-950">Savings/pension pressure</p><p className="mt-1 text-xs font-bold text-slate-500">Flags if the deal crowds out plans you already set.</p></div>
            </div>
          ) : null}

          {status === "error" ? <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-100">{payload?.error}</div> : null}

          {status === "done" && payload ? (
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900 ring-1 ring-emerald-100">
                <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4" /><p>{payload.summary || "Workflow created. LoopWatch will periodically re-check matching deals."} {payload.source_mode === "fallback" ? "Connect aggregator/import feeds later for live market coverage." : null}</p></div>
              </div>
              {(payload.shortlist || []).map((deal, index) => (
                <div key={`${deal.id || deal.title}-${index}`} className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-wide text-white">#{index + 1}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${bandClass(deal.affordabilityBand)}`}>{deal.affordabilityBand}</span>
                        <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-500 ring-1 ring-slate-100">{deal.dealType.toUpperCase()}</span>
                      </div>
                      <h4 className="mt-2 text-lg font-black text-slate-950">{deal.title}</h4>
                      <p className="mt-1 text-sm font-bold text-slate-500">{deal.summary}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-slate-950">{currency(deal.monthlyCost)}<span className="text-sm text-slate-400">/mo</span></p>
                      <p className="text-xs font-black text-slate-500">{currency(deal.upfrontCost)} upfront · {deal.termMonths}m · {deal.annualMileage?.toLocaleString("en-GB") || "—"} miles</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Score</p><p className="mt-1 font-black text-slate-950"><Gauge className="mr-1 inline h-4 w-4" /> {deal.score}/100</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Monthly impact</p><p className="mt-1 font-black text-slate-950">{currency(deal.impact.monthlyDelta)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Savings impact</p><p className="mt-1 font-black text-slate-950">{deal.impact.savingsImpact === null ? "Review" : currency(deal.impact.savingsImpact)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Left after deal</p><p className="mt-1 font-black text-slate-950">{currency(deal.impact.leftoverAfterDeal)}</p></div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <p className="rounded-2xl bg-blue-50 p-3 text-xs font-bold text-blue-900 ring-1 ring-blue-100"><Home className="mr-1 inline h-3.5 w-3.5" /> {deal.impact.houseAffordabilityNote}</p>
                    <p className="rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-900 ring-1 ring-emerald-100"><PiggyBank className="mr-1 inline h-3.5 w-3.5" /> {deal.impact.pensionNote}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
