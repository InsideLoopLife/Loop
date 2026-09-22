// lib/google/sync.ts
//
// Two-way sync between calendar_events and the user's Google Calendar.
// Called from the daily cron worker for every stored connection.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveHouseholdContext } from '@/domains/identity/household';
import { getValidAccessToken } from './oauth';
import type { CalendarEvent } from '../calendar/types';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

type GoogleEventRow = {
  user_id: string;
  household_id: string | null;
  visibility_scope: 'household';
  person_id: null;
  source: 'google';
  external_id: string;
  event_type: 'manual';
  title: string;
  event_date: string;
  amount: null;
  metadata: { htmlLink: string | null };
};

interface GoogleConnection {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  loop_calendar_id: string | null;
}

/** Pulls the user's own Google events into calendar_events (source='google'). */
export async function pullGoogleEvents(db: SupabaseClient, conn: GoogleConnection) {
  const { accessToken, refreshed } = await getValidAccessToken(conn);
  if (refreshed) await persistRefreshedToken(db, conn.user_id, refreshed);

  const household = await getActiveHouseholdContext(db, { id: conn.user_id });

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 7);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 90);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.error(`[google-sync] pull failed for ${conn.user_id}: ${res.status} ${await res.text()}`);
    return;
  }

  const data = await res.json();
  const items: any[] = data.items ?? [];
  if (!items.length) return;

  const rows = items
    .filter((item) => item.status !== 'cancelled')
    .map((item): GoogleEventRow | null => {
      const dateStr: string | undefined = item.start?.date ?? item.start?.dateTime?.slice(0, 10);
      if (!dateStr) return null;
      return {
        user_id: conn.user_id,
        household_id: household.householdId,
        visibility_scope: 'household' as const,
        person_id: null, // Google events aren't tied to a specific household person
        source: 'google' as const,
        external_id: item.id,
        event_type: 'manual' as const,
        title: item.summary ?? '(untitled)',
        event_date: dateStr,
        amount: null,
        metadata: { htmlLink: item.htmlLink ?? null },
      };
    })
    .filter((row): row is GoogleEventRow => row !== null);

  if (!rows.length) return;

  const { error } = await db
    .from('calendar_events')
    .upsert(rows, { onConflict: 'user_id,source,event_type,event_date,external_id' });

  if (error) console.error(`[google-sync] pull upsert failed for ${conn.user_id}:`, error.message);
}

/** Pushes not-yet-pushed loop_payment/loop_income/loop_calorie rows owned by this user into their Loop sub-calendar. */
export async function pushLoopEventsToGoogle(db: SupabaseClient, conn: GoogleConnection) {
  if (!conn.loop_calendar_id) return;

  const { accessToken, refreshed } = await getValidAccessToken(conn);
  if (refreshed) await persistRefreshedToken(db, conn.user_id, refreshed);

  const { data: pending, error } = await db
    .from('calendar_events')
    .select('*')
    .eq('user_id', conn.user_id) // only this account's own connection pushes; household members' items stay on their own connection
    .in('source', ['loop_payment', 'loop_income', 'loop_calorie'])
    .is('metadata->>google_pushed_id', null)
    .gte('event_date', new Date().toISOString().slice(0, 10));

  if (error || !pending?.length) return;

  for (const event of pending as CalendarEvent[]) {
    try {
      const pushedId = await pushOneEvent(accessToken, conn.loop_calendar_id, event);
      await db
        .from('calendar_events')
        .update({ metadata: { ...event.metadata, google_pushed_id: pushedId } })
        .eq('id', event.id);
    } catch (err) {
      console.error(`[google-sync] push failed for event ${event.id}:`, err);
    }
  }
}

async function pushOneEvent(accessToken: string, calendarId: string, event: CalendarEvent): Promise<string> {
  const nextDay = new Date(event.event_date + 'T00:00:00Z');
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  const res = await fetch(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: event.title,
      start: { date: event.event_date },
      end: { date: nextDay.toISOString().slice(0, 10) },
    }),
  });

  if (!res.ok) throw new Error(`Google event push failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

async function persistRefreshedToken(db: SupabaseClient, userId: string, refreshed: { access_token: string; expires_in: number }) {
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const { error } = await db
    .from('google_calendar_connections')
    .update({ access_token: refreshed.access_token, token_expires_at: expiresAt })
    .eq('user_id', userId);
  if (error) console.error(`[google-sync] failed to persist refreshed token for ${userId}:`, error.message);
}

