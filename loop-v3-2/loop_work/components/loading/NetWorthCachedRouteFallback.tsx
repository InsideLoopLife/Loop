"use client";

import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import { NetWorthClient, type NetWorthClientProps } from "@/components/net-worth/NetWorthClient";
import { useWarmRouteSnapshot } from "@/lib/client/use-warm-route-snapshot";

const TTL = 5 * 60 * 1000;

export function NetWorthCachedRouteFallback({ coldFallback }: { coldFallback?: ReactNode }) {
  const snapshot = useWarmRouteSnapshot<NetWorthClientProps>("net-worth", TTL);
  if (!snapshot) return <><Nav />{coldFallback ?? <WealthRouteSkeleton label="net worth" />}</>;
  return <><Nav /><div className="pointer-events-none opacity-95" aria-busy="true"><div className="mx-auto w-[95vw] max-w-none px-4 pt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400 md:px-8">Updating net worth…</div><NetWorthClient {...snapshot} /></div></>;
}
