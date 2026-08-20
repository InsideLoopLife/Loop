"use client";

import type { HouseUnifiedWorkspaceProps } from "@/components/mortgage/HouseUnifiedWorkspace";

let cachedHouseProps: HouseUnifiedWorkspaceProps | null = null;
let cachedAt = 0;
const TTL = 5 * 60 * 1000;

export function writeHouseRouteCache(props: HouseUnifiedWorkspaceProps) {
  const { cacheMode: _cacheMode, ...snapshot } = props;
  cachedHouseProps = snapshot as HouseUnifiedWorkspaceProps;
  cachedAt = Date.now();
}

export function readHouseRouteCache() {
  if (!cachedHouseProps) return null;
  if (Date.now() - cachedAt > TTL) {
    cachedHouseProps = null;
    cachedAt = 0;
    return null;
  }
  return cachedHouseProps;
}
