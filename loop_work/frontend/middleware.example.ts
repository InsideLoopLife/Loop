// Example Next.js middleware for closed beta.
// Put this at middleware.ts if your app uses Next.js.

import { NextRequest, NextResponse } from 'next/server';

const betaGateCookie = process.env.BETA_GATE_COOKIE_NAME || 'loop_beta_gate';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicPaths = ['/', '/privacy', '/terms', '/api/beta/access/verify', '/api/beta/register'];

  if (publicPaths.some((path) => pathname === path || pathname.startsWith('/assets'))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/auth') || pathname.startsWith('/signup')) {
    const gate = request.cookies.get(betaGateCookie)?.value;
    if (gate !== 'passed') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
