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

  // TODO: sign/encrypt this rather than raw base64 — see README caveat.
  const state = Buffer.from(JSON.stringify({ userId: user.id, nonce: crypto.randomUUID() })).toString('base64url');

  return NextResponse.redirect(buildGoogleAuthUrl(state));
}
