"use client";

import { HouseUnifiedWorkspace } from "@/components/mortgage/HouseUnifiedWorkspace";
import { readHouseRouteCache } from "@/lib/client/house-route-cache";

export function HouseCachedRouteFallback() {
  const cached = readHouseRouteCache();

  if (cached) {
    return <HouseUnifiedWorkspace {...cached} cacheMode="stale" />;
  }

  return (
    <main className="mx-auto w-[95vw] max-w-none px-4 py-4 md:px-8">
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden h-[620px] animate-pulse rounded-2xl bg-slate-100 lg:block" />
        <div className="min-w-0 space-y-4">
          <div className="h-9 w-72 animate-pulse rounded-xl bg-slate-100" />
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {[0,1,2,3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-white ring-1 ring-slate-100" />
            ))}
          </div>
          <div className="h-[470px] animate-pulse rounded-3xl bg-white ring-1 ring-slate-100" />
        </div>
      </div>
    </main>
  );
}
