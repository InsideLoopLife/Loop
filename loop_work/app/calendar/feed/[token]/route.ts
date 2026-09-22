// app/calendar/feed/[token]/route.ts
//
// Public, unauthenticated .ics subscription feed — security is the
// unguessable token, same trust model as Google/Apple's own "secret
// address" feeds. Uses the admin client since there's no session on
// this request; RLS is intentionally bypassed by design here.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/platform/database/admin-client';
import { buildIcsFeed } from '@/lib/calendar/ics';
import type { CalendarEvent } from '@/lib/calendar/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rawToken = token.replace(/\.ics$/, '');
  if (!rawToken || rawToken.length < 20) {
    return new NextResponse('Not found', { status: 404 });
  }

  const db = createAdminClient();

  const { data: tokenRow, error: tokenError } = await db
    .from('calendar_feed_tokens')
    .select('user_id, household_id')
    .eq('token', rawToken)
    .single();

  if (tokenError || !tokenRow) {
    return new NextResponse('Not found', { status: 404 });
  }

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30);
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + 90);

  // Household-wide if the user is in one (snapshotted at token creation),
  // otherwise just their own rows.
  let query = db
    .from('calendar_events')
    .select('*')
    .gte('event_date', windowStart.toISOString().slice(0, 10))
    .lte('event_date', windowEnd.toISOString().slice(0, 10));

  query = tokenRow.household_id
    ? query.or(`user_id.eq.${tokenRow.user_id},and(household_id.eq.${tokenRow.household_id},visibility_scope.eq.household)`)
    : query.eq('user_id', tokenRow.user_id);

  const { data: events, error: eventsError } = await query;

  if (eventsError) {
    return new NextResponse('Internal error', { status: 500 });
  }

  const ics = buildIcsFeed((events ?? []) as CalendarEvent[], 'Loop');

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="loop.ics"',
      'Cache-Control': 'no-store',
    },
  });
}

