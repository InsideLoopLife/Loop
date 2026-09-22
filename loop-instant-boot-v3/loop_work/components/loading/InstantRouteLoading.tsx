import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import { InstantBootSnapshot } from "@/components/performance/InstantBootSnapshot";
import type { RouteBootKey } from "@/lib/performance/route-boot";

export function InstantRouteLoading({
  routeKey,
  label,
}: {
  routeKey: RouteBootKey;
  label: string;
}) {
  return (
    <>
      <Nav />
      <Suspense fallback={<WealthRouteSkeleton label={label} />}>
        <InstantBootSnapshot routeKey={routeKey} fallbackLabel={label} />
      </Suspense>
    </>
  );
}
