// lib/calendar/useQuickCalendarSummary.ts
//
// Cache-first data hook for the nav-banner calendar popover, following
// the same stale-while-revalidate shape as lib/cache/client-route-cache.ts
// and the route-policy maxAge convention in lib/cache/route-policy.ts
// (calendar markers materialize once daily and change rarely — same
// "unlikely to change, but could update" volatility class as the
// lifestyle/account routes, both policed at 2-5 minutes there).
//
// Behaviour:
//   1. On first read, paint instantly from sessionStorage if present —
//      no spinner, no empty state, even on a cold popover open.
//   2. Always kick off a background refetch if the cached copy is older
//      than QUICK_SUMMARY_MAX_AGE_MS (or there's no cache at all).
//   3. Swap in fresh data only if it actually differs — avoids a
//      pointless re-render/flash when nothing changed, which matters
//      here because the data "is most likely not going to materially
//      change" between one popover open and the next.
//   4. Nav.tsx idle-warms this the same way it idle-warms eagerWealthRoutes,
//      so by the time someone actually clicks the icon, the fetch has
//      often already completed.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalendarEvent } from './types';

const CACHE_KEY = 'loop:calendar-quick-summary:v1';
const QUICK_SUMMARY_MAX_AGE_MS = 2 * 60 * 1000; // matches the /lifestyle route policy (2 min)

export interface QuickCalendarSummary {
  generatedAt: string;
  upcoming: Pick<CalendarEvent, 'id' | 'event_type' | 'title' | 'event_date' | 'amount' | 'person_id'>[];
  todaysCalories: Pick<CalendarEvent, 'id' | 'title' | 'event_date' | 'metadata' | 'person_id'>[];
}

interface CacheEnvelope {
  fetchedAt: number;
  data: QuickCalendarSummary;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readCache(): CacheEnvelope | null {
  const raw = storage()?.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CacheEnvelope;
  } catch {
    return null;
  }
}

function writeCache(data: QuickCalendarSummary) {
  storage()?.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data } satisfies CacheEnvelope));
}

function sameSummary(a: QuickCalendarSummary | null, b: QuickCalendarSummary): boolean {
  if (!a) return false;
  // Compare on content, not generatedAt, so an identical refetch doesn't
  // trigger a re-render just because the timestamp moved.
  return JSON.stringify(a.upcoming) === JSON.stringify(b.upcoming) && JSON.stringify(a.todaysCalories) === JSON.stringify(b.todaysCalories);
}

/**
 * Shared module-level in-flight promise so multiple mounted instances
 * (e.g. the icon button warms it on idle, then the popover itself reads
 * it on open) don't fire duplicate requests.
 */
let inFlight: Promise<QuickCalendarSummary | null> | null = null;

function fetchSummary(): Promise<QuickCalendarSummary | null> {
  if (inFlight) return inFlight;
  inFlight = fetch('/api/calendar/quick-summary', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useQuickCalendarSummary() {
  const [summary, setSummary] = useState<QuickCalendarSummary | null>(() => readCache()?.data ?? null);
  const [loading, setLoading] = useState(summary === null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (force = false) => {
    const cached = readCache();
    const isStale = force || !cached || Date.now() - cached.fetchedAt >= QUICK_SUMMARY_MAX_AGE_MS;
    if (!isStale) return;

    const fresh = await fetchSummary();
    if (!fresh || !mountedRef.current) return;

    writeCache(fresh);
    setSummary((prev) => (sameSummary(prev, fresh) ? prev : fresh));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(summary === null);
    refresh().finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { summary, loading, refresh: () => refresh(true) };
}

/** Called from Nav.tsx's idle-warm effect, same pattern as warmRoutes(). */
export function warmQuickCalendarSummary() {
  const cached = readCache();
  const isStale = !cached || Date.now() - cached.fetchedAt >= QUICK_SUMMARY_MAX_AGE_MS;
  if (!isStale) return;
  fetchSummary().then((fresh) => {
    if (fresh) writeCache(fresh);
  });
}
