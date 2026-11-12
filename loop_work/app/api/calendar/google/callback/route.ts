// app/api/calendar/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerDatabaseClient } from '@/platform/database/server-client';
import { exchangeCodeForTokens, createLoopCalendar } from '@/lib/google/oauth';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://loop.app';

  if (!code || !state) {
    return NextResponse.redirect(new URL('/lifestyle?calendar_error=missing_code', appUrl));
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    userId = decoded.userId;
    const expected = req.cookies.get('loop_gcal_state')?.value;
    if (!expected || typeof decoded.nonce !== 'string' || decoded.nonce !== expected) throw new Error('state mismatch');
  } catch {
    return NextResponse.redirect(new URL('/lifestyle?calendar_error=bad_state', appUrl));
  }

  const db = await createServerDatabaseClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || user.id !== userId) {
    return NextResponse.redirect(new URL('/lifestyle?calendar_error=session_mismatch', appUrl));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL('/lifestyle?calendar_error=no_refresh_token', appUrl));
    }

    const loopCalendarId = await createLoopCalendar(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error } = await db.from('google_calendar_connections').upsert({
      user_id: user.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      loop_calendar_id: loopCalendarId,
      connected_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[google-callback] failed to store connection:', error.message);
      return NextResponse.redirect(new URL('/lifestyle?calendar_error=storage_failed', appUrl));
    }

    const done = NextResponse.redirect(new URL('/lifestyle?calendar_connected=1', appUrl));
    done.cookies.delete({ name: 'loop_gcal_state', path: '/api/calendar/google' });
    return done;
  } catch (err) {
    console.error('[google-callback] OAuth exchange failed:', err);
    return NextResponse.redirect(new URL('/lifestyle?calendar_error=oauth_failed', appUrl));
  }
}
