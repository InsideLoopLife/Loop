// app/api/calendar/google/connect/route.ts
import { NextResponse } from 'next/server';
import { createServerDatabaseClient } from '@/platform/database/server-client';
import { buildGoogleAuthUrl } from '@/lib/google/oauth';

export async function GET() {
  const db = await createServerDatabaseClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL));
  }

  // The nonce is also kept in a short-lived cookie only this browser has; the
  // callback only accepts a reply whose state carries the same nonce, so a
  // link someone else started can't connect their calendar to your account.
  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ userId: user.id, nonce })).toString('base64url');
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  res.cookies.set('loop_gcal_state', nonce, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/calendar/google', maxAge: 600 });
  return res;
}
