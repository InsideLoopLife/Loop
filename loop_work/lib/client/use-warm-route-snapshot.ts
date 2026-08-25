"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { readRouteSnapshot } from "@/lib/client/route-snapshot-cache";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useWarmRouteSnapshot<T>(key: string, ttlMs: number) {
  const [snapshot, setSnapshot] = useState<T | null>(null);
  useBeforePaint(() => {
    setSnapshot(readRouteSnapshot<T>(key, ttlMs));
  }, [key, ttlMs]);
  return snapshot;
}
