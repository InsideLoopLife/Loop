"use client";

import * as React from "react";
import { BarcodeScanner } from "@/components/product/BarcodeScanner";

export function ProductMatchFirstSearch({ householdId, onChooseCandidate, onAiFallback }: { householdId?: string | null; onChooseCandidate?: (candidate: any) => void; onAiFallback?: (payload: any) => void }) {
  const [query, setQuery] = React.useState("");
  const [retailer, setRetailer] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);

  async function resolve() {
    setBusy(true);
    const res = await fetch("/api/products/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, retailer, household_id: householdId || null }) });
    const json = await res.json();
    setResult(json);
    setBusy(false);
  }

  async function estimateOnlyIfAllowed() {
    setBusy(true);
    const res = await fetch("/api/nutrition/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: query, retailer, household_id: householdId || null }) });
    const json = await res.json();
    setBusy(false);
    if (json.candidates?.length) { setResult(json); return; }
    onAiFallback?.(json);
  }

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Match first</p>
        <h3 className="text-xl font-black">Search imported products before AI</h3>
        <p className="mt-1 text-sm text-slate-500">Example: “Aldi cheese pesto pasta bake” should find imported Aldi/library products first. AI only estimates if no credible match exists.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto_auto]">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. pasta meal from Aldi cheese pesto pasta bake" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <input value={retailer} onChange={(e) => setRetailer(e.target.value)} placeholder="Retailer" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <button type="button" onClick={resolve} disabled={busy || !query.trim()} className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50">Find match</button>
        <button type="button" onClick={estimateOnlyIfAllowed} disabled={busy || !query.trim()} className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">Ask AI</button>
      </div>
      <BarcodeScanner householdId={householdId} onResult={setResult} />
      {result ? (
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-sm font-black">Status: {result.status || result.mode} · AI allowed: {String(result.aiAllowed ?? result.ai_allowed ?? false)}</p>
          {result.candidates?.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {result.candidates.map((candidate: any, index: number) => (
                <button type="button" key={`${candidate.card_id || candidate.display_name}-${index}`} onClick={() => onChooseCandidate?.(candidate)} className="rounded-2xl bg-white p-4 text-left shadow-sm">
                  <p className="font-black">{candidate.display_name}</p>
                  <p className="text-sm text-slate-500">{candidate.brand_name || candidate.retailer_name || candidate.source_provider || "source"}</p>
                  <p className="mt-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{Math.round(candidate.match_score || 0)}% · {candidate.match_reason}</p>
                </button>
              ))}
            </div>
          ) : <p className="mt-3 text-sm font-bold text-slate-500">No product match found. AI fallback can be used, but it will be labelled as an estimate.</p>}
          {result.sourceTrace || result.source_trace ? (
            <details className="mt-4"><summary className="cursor-pointer text-sm font-black">Source trace</summary><pre className="mt-2 overflow-auto rounded-2xl bg-slate-950 p-3 text-xs text-white">{JSON.stringify(result.sourceTrace || result.source_trace, null, 2)}</pre></details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
