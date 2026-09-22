"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { formatMoney } from "@/lib/format/money";

type Result = {
  score: number;
  status: "healthy" | "partial" | "unavailable";
  annualOpportunity: number;
  checkedAt?: string | null;
};

export function SavingsMarketHealthDeferred({
  scopePersonIds,
}: {
  scopePersonIds?: string[];
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (scopePersonIds?.length) params.set("people", scopePersonIds.join(","));

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/financial-flow/savings-market-health?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) throw new Error("market health unavailable");
        setResult(payload);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [scopePersonIds?.join(",")]);

  if (!result) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <RefreshCw className={`h-4 w-4 ${failed ? "" : "animate-spin"}`} />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Savings intelligence</p>
            <p className="mt-1 text-sm font-bold text-slate-600">
              {failed ? "Market comparison will retry when this section refreshes." : "Your savings are ready. LOOP is checking the market separately."}
            </p>
          </div>
        </div>
        <Link href="/accounts?tab=ai" className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">
          Optimiser
        </Link>
      </section>
    );
  }

  return (
    <section className={`flex flex-wrap items-center justify-between gap-4 rounded-[1.35rem] border p-4 shadow-sm ${
      result.status === "healthy" ? "border-emerald-200 bg-emerald-50/65" : "border-amber-200 bg-amber-50/65"
    }`}>
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-950 text-white">
          <span className="text-xl font-black">{result.score}</span>
          <span className="-mt-4 text-[9px] font-black text-white/50">/100</span>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Savings health</p>
          <p className="mt-1 text-lg font-black text-slate-950">
            {result.status === "healthy"
              ? `${formatMoney(result.annualOpportunity)}/yr estimated rate opportunity`
              : "Market comparison is still incomplete"}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Market intelligence loaded after your own savings data.</p>
        </div>
      </div>
      <Link href="/accounts?tab=ai" className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">
        See actions
      </Link>
    </section>
  );
}
