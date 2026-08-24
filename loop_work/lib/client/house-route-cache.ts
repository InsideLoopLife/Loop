"use client";

import type { HouseUnifiedWorkspaceProps } from "@/components/mortgage/HouseUnifiedWorkspace";
import {
  readRouteSnapshot,
  writeRouteSnapshot,
} from "@/lib/client/route-snapshot-cache";

const CACHE_KEY = "house";
const TTL = 5 * 60 * 1000;

export function writeHouseRouteCache(props: HouseUnifiedWorkspaceProps) {
  const { cacheMode: _cacheMode, ...snapshot } = props;
  writeRouteSnapshot(CACHE_KEY, snapshot as HouseUnifiedWorkspaceProps);
}

export function readHouseRouteCache() {
  return readRouteSnapshot<HouseUnifiedWorkspaceProps>(CACHE_KEY, TTL);
}
