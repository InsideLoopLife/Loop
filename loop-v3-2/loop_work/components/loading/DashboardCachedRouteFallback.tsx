"use client";

import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import { DashboardGrid, type DashboardGridProps } from "@/components/dashboard/DashboardGrid";
import { useWarmRouteSnapshot } from "@/lib/client/use-warm-route-snapshot";

const TTL = 5 * 60 * 1000;

export function DashboardCachedRouteFallback({ coldFallback }: { coldFallback?: ReactNode }) {
  const snapshot = useWarmRouteSnapshot<DashboardGridProps>("dashboard", TTL);
  if (!snapshot) return <><Nav />{coldFallback ?? <WealthRouteSkeleton label="dashboard" />}</>;
  return <><Nav /><main className="mx-auto w-[95vw] max-w-[2000px] px-4 py-6 sm:px-6 lg:px-8"><p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">Updating dashboard…</p><div className="pointer-events-none opacity-95" aria-busy="true"><DashboardGrid {...snapshot} /></div></main></>;
}
