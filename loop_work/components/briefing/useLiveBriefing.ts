"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FinancialBriefing } from "@/lib/briefing/build-financial-briefing";

type LiveStatus = "idle" | "refreshing" | "live" | "error";

/**
 * Keeps a FinancialBriefing fresh by polling /api/briefing in the background.
 * The page renders instantly from server-fetched `initial` data (no loading
 * flash), then this hook quietly re-fetches on an interval — and immediately
 * when the tab regains focus — so figures update the way a "real-time" feed
 * should without the cost of a persistent socket connection.
 */
export function useLiveBriefing(initial: FinancialBriefing, intervalMs = 45_000) {
  const [briefing, setBriefing] = useState(initial);
  const [status, setStatus] = useState<LiveStatus>("live");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date(initial.generatedAt));
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus((s) => (s === "error" ? "refreshing" : "refreshing"));
    try {
      const res = await fetch("/api/briefing", { cache: "no-store" });
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      const { briefing: next } = (await res.json()) as { briefing: FinancialBriefing };
      setBriefing(next);
      setLastUpdated(new Date());
      setStatus("live");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, intervalMs);
    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, intervalMs]);

  return { briefing, status, lastUpdated, refresh };
}
