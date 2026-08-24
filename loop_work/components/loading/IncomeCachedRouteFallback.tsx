"use client";

import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import { IncomeTrackerClient, type IncomeTrackerClientProps } from "@/components/income/IncomeTrackerClient";
import { readRouteSnapshot } from "@/lib/client/route-snapshot-cache";

const TTL = 5 * 60 * 1000;

export function IncomeCachedRouteFallback() {
  const snapshot = readRouteSnapshot<IncomeTrackerClientProps>("income", TTL);
  if (!snapshot) return <><Nav /><WealthRouteSkeleton label="income" /></>;
  return (
    <>
      <Nav />
      <div className="pointer-events-none opacity-95" aria-busy="true">
        <div className="mx-auto w-[95vw] max-w-[2000px] px-4 pt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400 sm:px-6 lg:px-8">Updating income…</div>
        <IncomeTrackerClient {...snapshot} />
      </div>
    </>
  );
}
