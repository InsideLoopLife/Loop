import { emitRoutesStale } from "@/lib/cache/client-route-cache";

export type LoopCacheArea =
  | "spending"
  | "emergency-fund"
  | "savings"
  | "investments"
  | "property"
  | "household"
  | "dashboard";

const AREA_ROUTES: Record<LoopCacheArea, string[]> = {
  spending: ["/spending", "/spending/categories", "/financial-flow"],
  "emergency-fund": ["/accounts", "/savings", "/pots"],
  savings: ["/accounts", "/savings", "/pots", "/financial-flow"],
  investments: ["/investments", "/dashboard", "/net-worth"],
  property: ["/mortgage", "/affordability", "/dashboard", "/net-worth"],
  household: ["/household", "/account", "/dashboard"],
  dashboard: ["/dashboard", "/briefing"],
};

export function invalidateLoopAreas(...areas: LoopCacheArea[]) {
  emitRoutesStale(Array.from(new Set(areas.flatMap((area) => AREA_ROUTES[area]))));
}

