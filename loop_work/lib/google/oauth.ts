// lib/google/oauth.ts
//
// Thin wrapper over Google's OAuth2 + Calendar API — plain fetch, no
// googleapis SDK, consistent with Loop's other provider integrations.
// Unaffected by the household-scoping rework: unchanged from the first
// draft except this note.
//
// Required env vars (Render + local .env):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REDIRECT_URI   e.g. https://loop.app/api/calendar/google/callback

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.calendarlist'];

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function createLoopCalendar(accessToken: string): Promise<string> {
  const res = await fetch(`${CALENDAR_API_BASE}/calendars`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: 'Loop', description: 'Payments, income and calorie tracking from Loop' }),
  });
  if (!res.ok) throw new Error(`Failed to create Loop sub-calendar: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

export async function getValidAccessToken(conn: {
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}): Promise<{ accessToken: string; refreshed: TokenResponse | null }> {
  const expiresAt = new Date(conn.token_expires_at).getTime();
  const isExpired = Date.now() > expiresAt - 60_000;
  if (!isExpired) return { accessToken: conn.access_token, refreshed: null };
  const refreshed = await refreshAccessToken(conn.refresh_token);
  return { accessToken: refreshed.access_token, refreshed };
}
