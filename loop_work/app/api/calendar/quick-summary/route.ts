// app/api/calendar/quick-summary/route.ts
//
// Small, fast payload for the nav-banner calendar quick-access popover.
// Deliberately NOT the full month of events CalendarPage loads — just
// enough for an at-a-glance panel: the next few upcoming payment/income
// markers and today's calorie progress. Goes through the authenticated
// server client so RLS (calendar_events_select_household) does the
// household-visibility filtering for free — no manual household lookup
// needed here.

import { NextResponse } from 'next/server';
import { createServerDatabaseClient } from '@/platform/database/server-client';
import type { CalendarEvent } from '@/lib/calendar/types';

const UPCOMING_LIMIT = 5;
const UPCOMING_WINDOW_DAYS = 14;

export async function GET() {
  const db = await createServerDatabaseClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + UPCOMING_WINDOW_DAYS);

  const [{ data: upcoming, error: upcomingError }, { data: todaysCalories, error: caloriesError }] = await Promise.all([
    db
      .from('calendar_events')
      .select('id, event_type, title, event_date, amount, person_id')
      .in('event_type', ['payment_due', 'income_expected'])
      .gte('event_date', today)
      .lte('event_date', windowEnd.toISOString().slice(0, 10))
      .order('event_date', { ascending: true })
      .limit(UPCOMING_LIMIT),
    db
      .from('calendar_events')
      .select('id, title, event_date, metadata, person_id')
      .eq('event_type', 'calorie_progress')
      .eq('event_date', today),
  ]);

  if (upcomingError || caloriesError) {
    return NextResponse.json({ error: (upcomingError ?? caloriesError)?.message }, { status: 500 });
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    upcoming: (upcoming ?? []) as Pick<CalendarEvent, 'id' | 'event_type' | 'title' | 'event_date' | 'amount' | 'person_id'>[],
    todaysCalories: (todaysCalories ?? []) as Pick<CalendarEvent, 'id' | 'title' | 'event_date' | 'metadata' | 'person_id'>[],
  });
}
