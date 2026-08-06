import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const ACCESS_COOKIE_NAME = "loop_beta_access";

function accessGateRequired() {
  return (
    process.env.LOOP_BETA_GATE_ENABLED === "true" ||
    process.env.LOOP_ACCESS_REQUIRED === "true" ||
    Boolean(
      process.env.LOOP_ACCESS_CODE ||
      process.env.LOOP_ACCESS_CODE_HASH ||
      process.env.LOOP_ACCESS_COOKIE_VALUE ||
      process.env.LOOP_BETA_CODE_PEPPER ||
      process.env.LOOP_BETA_COOKIE_SECRET,
    )
  );
}

async function hmacHex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function accessCookieValue() {
  const secret = process.env.LOOP_BETA_COOKIE_SECRET || process.env.LOOP_ACCESS_COOKIE_VALUE || process.env.LOOP_ACCESS_CODE_HASH || "loop-dev-access";
  return hmacHex(secret, "insideloop-private-beta:v1");
}

const publicWithoutAccess = new Set(["/access", "/beta", "/favicon.ico"]);

function isPublicAsset(pathname: string) {
  return pathname.startsWith("/_next") || pathname.startsWith("/api/qr") || /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/i.test(pathname);
}

function isPublicCallback(pathname: string) {
  return pathname === "/auth/callback" || pathname === "/reset-password/verify";
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (accessGateRequired() && !isPublicAsset(pathname) && !pathname.startsWith("/api/") && !publicWithoutAccess.has(pathname) && !isPublicCallback(pathname)) {
    const unlocked = request.cookies.get(ACCESS_COOKIE_NAME)?.value === await accessCookieValue();
    if (!unlocked) {
      const url = request.nextUrl.clone();
      url.pathname = "/access";
      url.searchParams.set("next", pathname + request.nextUrl.search);
      const response = NextResponse.redirect(url);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
