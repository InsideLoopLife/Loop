"use client";

type CacheEnvelope<T> = {
  version: number;
  writtenAt: number;
  value: T;
};

const memory = new Map<string, CacheEnvelope<unknown>>();
const PREFIX = "loop:route-snapshot:";
const VERSION = 1;

function storageKey(key: string) {
  return `${PREFIX}${key}:v${VERSION}`;
}

export function writeRouteSnapshot<T>(key: string, value: T) {
  const envelope: CacheEnvelope<T> = {
    version: VERSION,
    writtenAt: Date.now(),
    value,
  };

  memory.set(key, envelope as CacheEnvelope<unknown>);

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(envelope));
  } catch {
    // Optional enhancement only: storage failures must never break a route.
  }
}

export function readRouteSnapshot<T>(key: string, ttlMs: number): T | null {
  const inMemory = memory.get(key) as CacheEnvelope<T> | undefined;

  if (inMemory) {
    if (Date.now() - inMemory.writtenAt <= ttlMs) return inMemory.value;
    memory.delete(key);
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (
      parsed.version !== VERSION ||
      !parsed.writtenAt ||
      Date.now() - parsed.writtenAt > ttlMs
    ) {
      window.sessionStorage.removeItem(storageKey(key));
      return null;
    }

    memory.set(key, parsed as CacheEnvelope<unknown>);
    return parsed.value;
  } catch {
    return null;
  }
}

export function clearRouteSnapshot(key: string) {
  memory.delete(key);

  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(storageKey(key));
  } catch {
    // Cache clearing must not affect route behaviour.
  }
}
