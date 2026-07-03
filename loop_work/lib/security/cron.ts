import { NextRequest, NextResponse } from "next/server";

export type CronGuardResult =
  | { ok: true; mode: "secret" | "vercel" | "development" }
  | { ok: false; response: NextResponse };

function bearerToken(headerValue: string | null) {
  if (!headerValue) return "";
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return (match?.[1] || headerValue).trim();
}

export function verifyCronRequest(request: NextRequest): CronGuardResult {
  const configuredSecret = String(process.env.CRON_SECRET || process.env.LOOP_CRON_SECRET || "").trim();
  const suppliedSecret =
    bearerToken(request.headers.get("authorization")) ||
    String(request.headers.get("x-cron-secret") || "").trim() ||
    String(request.nextUrl.searchParams.get("secret") || "").trim();

  if (configuredSecret) {
    if (suppliedSecret === configuredSecret) return { ok: true, mode: "secret" };
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Cron secret missing or invalid. Add Authorization: Bearer $CRON_SECRET or x-cron-secret." },
        { status: 401 },
      ),
    };
  }

  const userAgent = String(request.headers.get("user-agent") || "").toLowerCase();
  const isVercelCron = userAgent.includes("vercel-cron") || request.headers.get("x-vercel-cron") === "1";
  if (isVercelCron && process.env.VERCEL) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "CRON_SECRET is required in production before scheduled wealth-watch jobs can run." },
        { status: 503 },
      ),
    };
  }

  if (process.env.NODE_ENV !== "production") return { ok: true, mode: "development" };

  return {
    ok: false,
    response: NextResponse.json(
      { error: "CRON_SECRET is required before this scheduled endpoint can run." },
      { status: 503 },
    ),
  };
}

export function cronSecretConfigured() {
  return Boolean(String(process.env.CRON_SECRET || process.env.LOOP_CRON_SECRET || "").trim());
}
