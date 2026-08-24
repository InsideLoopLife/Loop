"use client";

import { useEffect } from "react";
import type {
  RouteBootKey,
  RouteBootPayload,
} from "@/lib/performance/route-boot";
import { sanitizeRouteBootPayload } from "@/lib/performance/route-boot";

const PREFIX = "loop:boot-published:";
const REPUBLISH_AFTER_MS = 10 * 60 * 1000;

function tinyHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export async function publishRouteBootSnapshot(
  routeKey: RouteBootKey,
  payloadInput: RouteBootPayload,
) {
  if (typeof window === "undefined") return;

  const payload = sanitizeRouteBootPayload(payloadInput);
  if (!payload) return;

  const serialised = JSON.stringify(payload);
  const hash = tinyHash(serialised);
  const stateKey = `${PREFIX}${routeKey}`;

  try {
    const existing = JSON.parse(
      window.sessionStorage.getItem(stateKey) || "null",
    ) as { hash?: string; at?: number } | null;

    if (
      existing?.hash === hash &&
      existing?.at &&
      Date.now() - existing.at < REPUBLISH_AFTER_MS
    ) {
      return;
    }
  } catch {
    // Publishing remains best-effort.
  }

  try {
    const response = await fetch("/api/route-boot-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routeKey, payload }),
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
    });

    if (!response.ok) return;

    try {
      window.sessionStorage.setItem(
        stateKey,
        JSON.stringify({ hash, at: Date.now() }),
      );
    } catch {
      // sessionStorage is only a write-throttling enhancement.
    }
  } catch {
    // Never let snapshot publishing affect the live product.
  }
}

export function RouteBootSnapshotPublisher({
  routeKey,
  payload,
}: {
  routeKey: RouteBootKey;
  payload: RouteBootPayload;
}) {
  const serialised = JSON.stringify(payload);

  useEffect(() => {
    const parsed = JSON.parse(serialised) as RouteBootPayload;
    void publishRouteBootSnapshot(routeKey, parsed);
  }, [routeKey, serialised]);

  return null;
}
