// components/calendar/CalendarQuickAccessButton.tsx
//
// Nav-banner icon button + popover. Mounted once in Nav.tsx (persistent
// across pages, same as the account button), so it's always available
// regardless of which page someone's on.
//
// Speed approach mirrors Loop's existing cache-first convention
// (CACHE_FIRST_UPDATE_MANIFEST.md): cached content paints first,
// potentially-stale data reconciles in the background. Concretely:
//   - useQuickCalendarSummary reads sessionStorage synchronously on
//     mount, so if the icon warmed during idle time (see Nav.tsx),
//     opening the popover shows real content with zero network wait.
//   - A background refresh runs on open regardless, in case the cache
//     is older than the 2-minute policy window — but the existing
//     content stays visible while that happens, it's never blanked.
//   - No loading spinner replaces real content once any content has
//     ever been shown — only the very first cold load (no cache at
//     all) shows the skeleton below.

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, PoundSterling, Flame } from 'lucide-react';
import { useQuickCalendarSummary } from '@/lib/calendar/useQuickCalendarSummary';

export function CalendarQuickAccessButton({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const { summary, loading, refresh } = useQuickCalendarSummary();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    refresh(); // background reconcile — doesn't clear `summary` while it runs
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hasAnyContent = (summary?.upcoming.length ?? 0) > 0 || (summary?.todaysCalories.length ?? 0) > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Calendar quick access"
        aria-expanded={open}
        className={
          dark
            ? 'grid h-10 w-10 place-items-center rounded-full text-slate-200 hover:bg-white/10'
            : 'grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm'
        }
      >
        <CalendarClock className="h-5 w-5" />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Calendar</h3>
            <Link href="/lifestyle?tab=calendar" onClick={() => setOpen(false)} className="text-xs font-bold text-indigo-600 hover:underline">
              Open full calendar
            </Link>
          </div>

          {!summary && loading ? (
            <QuickAccessSkeleton />
          ) : !hasAnyContent ? (
            <p className="py-4 text-center text-xs font-semibold text-slate-400">Nothing coming up in the next two weeks.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {summary!.todaysCalories.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Today</p>
                  {summary!.todaysCalories.map((c) => {
                    const meta = c.metadata as { consumed?: number; target?: number; pct?: number };
                    return (
                      <div key={c.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                        <Flame className="h-4 w-4 shrink-0 text-orange-500" />
                        <span className="text-xs font-semibold text-slate-700">
                          {meta.consumed ?? 0} / {meta.target ?? 2200} kcal{meta.pct != null ? ` (${meta.pct}%)` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {summary!.upcoming.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Upcoming</p>
                  <ul className="flex flex-col gap-1.5">
                    {summary!.upcoming.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                        <PoundSterling className={`h-4 w-4 shrink-0 ${e.event_type === 'income_expected' ? 'text-emerald-600' : 'text-rose-500'}`} />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{e.title}</span>
                        <span className="shrink-0 text-[11px] font-bold text-slate-400">
                          {new Date(e.event_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuickAccessSkeleton() {
  // Only ever shown on a genuinely cold load (no cache, nothing warmed
  // yet) — matches the page-shaped skeleton approach in
  // components/loading/WealthRouteSkeleton.tsx rather than a bare spinner.
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}
