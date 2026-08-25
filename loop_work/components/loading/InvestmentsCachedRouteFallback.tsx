"use client";

import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import { PensionsInvestmentsClient, type PensionsInvestmentsClientProps } from "@/components/investments/PensionsInvestmentsClient";
import { useWarmRouteSnapshot } from "@/lib/client/use-warm-route-snapshot";

const TTL = 5 * 60 * 1000;

export function InvestmentsCachedRouteFallback({ coldFallback }: { coldFallback?: ReactNode }) {
  const snapshot = useWarmRouteSnapshot<PensionsInvestmentsClientProps>("investments-core", TTL);
  if (!snapshot) return <><Nav />{coldFallback ?? <WealthRouteSkeleton label="investments and pensions" />}</>;
  return <><Nav /><div className="pointer-events-none opacity-95" aria-busy="true"><div className="mx-auto w-[95vw] max-w-[2000px] px-4 pt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400 sm:px-6 lg:px-8">Updating investments and pensions…</div><PensionsInvestmentsClient {...snapshot} /></div></>;
}
