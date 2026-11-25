"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { quietly } from "@/components/feedback/quiet-action";
import { isLoopError } from "@/lib/actions/friendly";
import { loadUpcomingChanges } from "@/app/mortgage/household-actions";
import type { UpcomingChange } from "@/lib/household/upcoming";

const gbp = (v: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const day = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const AREA: Record<UpcomingChange["area"], string> = { home: "Home", bills: "Bill", mortgage: "Mortgage", energy: "Energy", cars: "Car", appliances: "Appliance" };

/** Everything about to change in the household's costs, month by month, for the next year. */
export function UpcomingChanges({ dealEnd, lender, limit, onSeeAll }: { dealEnd: string | null; lender: string | null; limit?: number; onSeeAll?: () => void }) {
  const [changes, setChanges] = useState<UpcomingChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void quietly(() => loadUpcomingChanges({ dealEnd, lender })).then((result) => {
      if (!live) return;
      if (isLoopError(result)) setError(result.__loopError);
      else setChanges((result as { changes: UpcomingChange[] }).changes);
    });
    return () => { live = false; };
  }, [dealEnd, lender]);

  if (error) return <p className="text-sm font-semibold text-rose-700">{error}</p>;
  if (!changes) return <p className="text-sm font-semibold text-slate-500">Checking what&apos;s coming up…</p>;
  if (!changes.length) return <p className="text-sm font-semibold text-slate-500">Nothing changes in the next 12 months. Add end dates to bills in Spending to see renewals here.</p>;

  const shown = limit ? changes.slice(0, limit) : changes;
  const net = changes.reduce((sum, c) => sum + (c.monthlyChange || 0), 0);
  const byMonth = new Map<string, UpcomingChange[]>();
  for (const change of shown) byMonth.set(change.date.slice(0, 7), [...(byMonth.get(change.date.slice(0, 7)) || []), change]);

  return (
    <div className="space-y-4">
      {!limit ? (
        <p className="text-sm font-semibold text-slate-600">
          {changes.length} change{changes.length === 1 ? "" : "s"} in the next year.{" "}
          {Math.abs(net) >= 1 ? <>Known bills {net > 0 ? "go up" : "come down"} by <strong className={net > 0 ? "text-rose-700" : "text-emerald-700"}>{gbp(Math.abs(net))} a month</strong> overall.</> : null}
        </p>
      ) : null}
      {[...byMonth.entries()].map(([month, list]) => (
        <section key={month}>
          <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{monthName(month)}</h3>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {list.map((change) => (
              <li key={change.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-14 shrink-0 text-sm font-black text-slate-900">{day(change.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-950">{change.title} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">{AREA[change.area]}</span></span>
                  {change.detail ? <span className="block text-xs font-semibold text-slate-500">{change.detail}</span> : null}
                </span>
                {change.monthlyChange ? (
                  <span className={`shrink-0 text-sm font-black ${change.monthlyChange > 0 ? "text-rose-700" : "text-emerald-700"}`}>{change.monthlyChange > 0 ? "+" : "−"}{gbp(Math.abs(change.monthlyChange))}/mo</span>
                ) : null}
                {change.action ? <Link href={change.action.href} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">{change.action.label}</Link> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {limit && changes.length > limit && onSeeAll ? (
        <button type="button" onClick={onSeeAll} className="text-sm font-black text-violet-700 hover:underline">See all {changes.length} upcoming changes →</button>
      ) : null}
    </div>
  );
}
