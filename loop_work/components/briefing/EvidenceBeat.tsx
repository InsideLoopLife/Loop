"use client";

import { Landmark, CircleAlert } from "lucide-react";
import type { FinancialBriefing } from "@/lib/briefing/build-financial-briefing";

export function EvidenceBeat({ dataQuality, generatedAt }: { dataQuality: FinancialBriefing["dataQuality"]; generatedAt: string }) {
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6">
      <Landmark className="text-orange-600" />
      <h2 className="mt-4 text-2xl font-black">Evidence health</h2>
      <div className="mt-4 space-y-3">
        {dataQuality.length ? (
          dataQuality.slice(0, 3).map((q, i) => (
            <div key={i} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
              <p className="text-sm font-semibold text-slate-600">
                <b className="text-slate-900">{q.area}:</b> {q.issue}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Your core financial records look sufficiently complete for this briefing.</div>
        )}
      </div>
      <p className="mt-5 text-xs font-semibold text-slate-400">Updated {new Date(generatedAt).toLocaleString("en-GB")} · Figures may include estimates and are not financial advice.</p>
    </article>
  );
}
