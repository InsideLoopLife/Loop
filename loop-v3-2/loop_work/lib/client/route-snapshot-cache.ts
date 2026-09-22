"use client";

type CacheEnvelope<T> = {
  version: number;
  writtenAt: number;
  value: T;
};

const memory = new Map<string, CacheEnvelope<unknown>>();
const VERSION = 2;

/**
 * Personal route payloads stay in JS memory only.
 * Hard refreshes use the authenticated household-scoped V3 server snapshot.
 */
export function writeRouteSnapshot<T>(key: string, value: T) {
  const envelope: CacheEnvelope<T> = {
    version: VERSION,
    writtenAt: Date.now(),
    value,
  };
  memory.set(key, envelope as CacheEnvelope<unknown>);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("loop:route-snapshot-written", { detail: { key } }),
    );
  }
}

export function readRouteSnapshot<T>(key: string, ttlMs: number): T | null {
  const cached = memory.get(key) as CacheEnvelope<T> | undefined;
  if (!cached) return null;
  if (cached.version !== VERSION || Date.now() - cached.writtenAt > ttlMs) {
    memory.delete(key);
    return null;
  }
  return cached.value;
}

export function clearRouteSnapshot(key: string) {
  memory.delete(key);
}

export function clearAllRouteSnapshots() {
  memory.clear();
}
