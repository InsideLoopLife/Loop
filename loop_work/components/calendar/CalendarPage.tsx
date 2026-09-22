// components/calendar/CalendarPage.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { FilterBar } from './FilterBar';
import { DayCell } from './DayCell';
import type { CalendarEvent, CalendarEventType, HouseholdPerson } from '@/lib/calendar/types';
import { createBrowserDatabaseClient } from '@/platform/database/browser-client';

function startOfMonthGrid(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const dayOfWeek = (first.getDay() + 6) % 7; // Monday-first grid
  const start = new Date(first);
  start.setDate(start.getDate() - dayOfWeek);
  return start;
}

export function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [people, setPeople] = useState<HouseholdPerson[]>([]);
  const [activePersonId, setActivePersonId] = useState<string | 'all'>('all');
  const [activeTypes, setActiveTypes] = useState<Set<CalendarEventType>>(
    new Set(['payment_due', 'income_expected', 'calorie_progress', 'manual'])
  );
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Household members — reuses the existing app/api/household/members
  // route rather than duplicating the query here.
  useEffect(() => {
    fetch('/api/household/members')
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((data) => setPeople(data.members ?? []))
      .catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const supabase = createBrowserDatabaseClient();

      const rangeStart = new Date(cursor.year, cursor.month, 1);
      rangeStart.setDate(rangeStart.getDate() - 7);
      const rangeEnd = new Date(cursor.year, cursor.month + 1, 0);
      rangeEnd.setDate(rangeEnd.getDate() + 7);

      // RLS (calendar_events_select_household) already limits this to the
      // caller's own rows + their household's shared rows — no manual
      // household filter needed client-side, just the date window.
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('event_date', rangeStart.toISOString().slice(0, 10))
        .lte('event_date', rangeEnd.toISOString().slice(0, 10));

      if (!cancelled) {
        if (error) console.error('[calendar] failed to load events:', error.message);
        setEvents((data ?? []) as CalendarEvent[]);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [cursor]);

  function toggleType(type: CalendarEventType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function fetchFeedUrl() {
    const res = await fetch('/api/calendar/feed-url');
    if (!res.ok) return;
    const data = await res.json();
    setFeedUrl(data.feedUrl);
  }

  const filteredEvents = events.filter((e) => {
    if (!activeTypes.has(e.event_type)) return false;
    if (activePersonId !== 'all' && e.person_id !== activePersonId) return false;
    return true;
  });

  const gridStart = startOfMonthGrid(cursor.year, cursor.month);
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filteredEvents) {
      const key = e.event_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filteredEvents]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCursor((c) => ({ year: c.month === 0 ? c.year - 1 : c.year, month: (c.month + 11) % 12 }))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            ←
          </button>
          <h2 className="text-lg font-semibold">{monthLabel}</h2>
          <button
            type="button"
            onClick={() => setCursor((c) => ({ year: c.month === 11 ? c.year + 1 : c.year, month: (c.month + 1) % 12 }))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            →
          </button>
        </div>

        <div className="flex items-center gap-2">
          <a href="/api/calendar/google/connect" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">
            Connect Google Calendar
          </a>
          <button type="button" onClick={fetchFeedUrl} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            Get Apple / .ics link
          </button>
        </div>
      </div>

      {feedUrl && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          Subscribe to this URL in Apple Calendar (Settings → Add Account → Other → Add Subscribed Calendar). It's read-only and
          refreshes on Apple's own schedule, not instantly:
          <code className="ml-2 break-all">{feedUrl}</code>
        </div>
      )}

      <FilterBar
        activeTypes={activeTypes}
        onToggleType={toggleType}
        people={people}
        activePersonId={activePersonId}
        onSelectPerson={setActivePersonId}
      />

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading…</div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {days.map((date) => (
            <DayCell
              key={date.toISOString()}
              date={date}
              isCurrentMonth={date.getMonth() === cursor.month}
              events={eventsByDay.get(date.toISOString().slice(0, 10)) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
