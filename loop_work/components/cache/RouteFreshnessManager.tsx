"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { Check, CloudOff, RefreshCw } from "lucide-react";
import {
  lastRouteCheck,
  markRouteChecked,
  markRouteVisited,
  routeNeedsRefresh,
  routeArrivalDecision,
  routeWasVisited,
} from "@/lib/cache/client-route-cache";
import { isPublicOrAuthRoute, normaliseLoopPath, routePolicy } from "@/lib/cache/route-policy";

type FreshnessState = "idle" | "checking" | "updated" | "offline";

function routeMatches(current: string, candidate: string) {
  return current === candidate || current.startsWith(`${candidate}/`) || candidate.startsWith(`${current}/`);
}

export function RouteFreshnessManager() {
  const pathname = normaliseLoopPath(usePathname());
  const router = useRouter();
  const policy = routePolicy(pathname);
  const [state, setState] = useState<FreshnessState>("idle");
  const [checkedAt, setCheckedAt] = useState(0);
  const refreshInFlight = useRef(false);
  const settleTimer = useRef<number | null>(null);

  const refresh = useCallback((force = false) => {
    if (isPublicOrAuthRoute(pathname) || refreshInFlight.current) return;
    if (!navigator.onLine) {
      setState("offline");
      return;
    }
    if (!force && !routeNeedsRefresh(pathname, policy.maxAgeMs)) return;

    refreshInFlight.current = true;
    const now = Date.now();
    // Mark before the request so focus/visibility events cannot create a request storm.
    markRouteChecked(pathname, now);
    setCheckedAt(now);
    setState("checking");
    startTransition(() => router.refresh());
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      refreshInFlight.current = false;
      setState("updated");
      window.setTimeout(() => setState("idle"), 1_800);
    }, 700);
  }, [pathname, policy.maxAgeMs, router]);

  useEffect(() => {
    if (isPublicOrAuthRoute(pathname)) return;
    const previousCheck = lastRouteCheck(pathname);
    const visited = routeWasVisited(pathname);
    const decision = routeArrivalDecision({ visited, previousCheck, maxAgeMs: policy.maxAgeMs });
    markRouteVisited(pathname);
    // A first visit has just completed a current authenticated server render,
    // so refreshing the entire route again only doubles the work. Revisited
    // prefetched pages reconcile after paint only when their policy says the
    // prior result is stale.
    if (decision === "accept-current") {
      const now = Date.now();
      markRouteChecked(pathname, now);
      const statusTimer = window.setTimeout(() => setCheckedAt(now), 0);
      return () => window.clearTimeout(statusTimer);
    }
    if (decision === "reuse-fresh") return;
    const timer = window.setTimeout(() => refresh(false), 350);
    return () => window.clearTimeout(timer);
  }, [pathname, policy.maxAgeMs, refresh]);

  useEffect(() => {
    if (isPublicOrAuthRoute(pathname)) return;
    const reconcileIfNeeded = () => {
      if (document.visibilityState === "visible") refresh(false);
    };
    const onOnline = () => refresh(true);
    const onStale = (event: Event) => {
      const routes = (event as CustomEvent<{ routes?: string[] }>).detail?.routes || [];
      if (routes.some((route) => routeMatches(pathname, route))) refresh(true);
    };
    window.addEventListener("focus", reconcileIfNeeded);
    window.addEventListener("online", onOnline);
    window.addEventListener("loop:routes-stale", onStale);
    document.addEventListener("visibilitychange", reconcileIfNeeded);
    const interval = window.setInterval(reconcileIfNeeded, Math.max(30_000, policy.maxAgeMs));
    return () => {
      window.removeEventListener("focus", reconcileIfNeeded);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("loop:routes-stale", onStale);
      document.removeEventListener("visibilitychange", reconcileIfNeeded);
      window.clearInterval(interval);
    };
  }, [pathname, policy.maxAgeMs, refresh]);

  useEffect(() => () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
  }, []);

  if (isPublicOrAuthRoute(pathname) || state === "idle") return null;
  const label = state === "offline"
    ? "Offline · showing saved view"
    : state === "checking"
      ? "Checking for updates…"
      : "Up to date";
  const Icon = state === "offline" ? CloudOff : state === "checking" ? RefreshCw : Check;

  return (
    <div
      role="status"
      aria-live="polite"
      title={checkedAt ? `Last checked ${new Date(checkedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : undefined}
      className="fixed bottom-4 right-4 z-[145] inline-flex items-center gap-2 rounded-full border border-white/70 bg-slate-950/90 px-3 py-2 text-xs font-black text-white shadow-xl backdrop-blur-md"
    >
      <Icon className={`h-3.5 w-3.5 ${state === "checking" ? "animate-spin" : ""}`} />
      {label}
    </div>
  );
}
