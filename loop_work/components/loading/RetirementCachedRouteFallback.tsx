"use client";

import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import { RetirementPageClient, type RetirementPageClientProps } from "@/app/retirement/RetirementPageClient";
import { readRouteSnapshot } from "@/lib/client/route-snapshot-cache";

const TTL = 10 * 60 * 1000;

export function RetirementCachedRouteFallback() {
  const snapshot = readRouteSnapshot<RetirementPageClientProps>("retirement", TTL);
  if (!snapshot) return <><Nav /><WealthRouteSkeleton label="retirement planning" /></>;
  return (
    <>
      <Nav />
      <div className="pointer-events-none opacity-95" aria-busy="true">
        <div className="mx-auto w-full max-w-[1500px] px-4 pt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400 sm:px-6 lg:px-8">Updating retirement plan…</div>
        <RetirementPageClient {...snapshot} />
      </div>
    </>
  );
}
