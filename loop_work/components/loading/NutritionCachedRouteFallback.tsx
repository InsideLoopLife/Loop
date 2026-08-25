"use client";

import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import { NutritionClient, type NutritionClientProps } from "@/components/nutrition/NutritionClient";
import { useWarmRouteSnapshot } from "@/lib/client/use-warm-route-snapshot";

const TTL = 5 * 60 * 1000;

export function NutritionCachedRouteFallback({ coldFallback }: { coldFallback?: ReactNode }) {
  const snapshot = useWarmRouteSnapshot<NutritionClientProps>("nutrition", TTL);
  if (!snapshot) return <><Nav />{coldFallback ?? <WealthRouteSkeleton label="nutrition" />}</>;
  return <><Nav /><div className="pointer-events-none opacity-95" aria-busy="true"><div className="mx-auto w-[95vw] max-w-[2000px] px-4 pt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400 sm:px-6 lg:px-8">Updating nutrition…</div><NutritionClient {...snapshot} /></div></>;
}
