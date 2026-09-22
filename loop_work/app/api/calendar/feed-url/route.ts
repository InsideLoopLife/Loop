// app/api/calendar/feed-url/route.ts
//
// Authenticated: get-or-create the current user's .ics subscription URL.

import { NextResponse } from 'next/server';
import { createServerDatabaseClient } from '@/platform/database/server-client';
import { getActiveHouseholdContext } from '@/domains/identity/household';

export async function GET() {
  const db = await createServerDatabaseClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let { data: existing } = await db.from('calendar_feed_tokens').select('token').eq('user_id', user.id).single();

  if (!existing) {
    const household = await getActiveHouseholdContext(db, user);
    const { data: created, error } = await db
      .from('calendar_feed_tokens')
      .insert({ user_id: user.id, household_id: household.householdId })
      .select('token')
      .single();

    if (error || !created) {
      return NextResponse.json({ error: 'could not create feed token' }, { status: 500 });
    }
    existing = created;
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://loop.app';
  const feedUrl = `${baseUrl}/calendar/feed/${existing.token}.ics`;

  return NextResponse.json({ feedUrl });
}
