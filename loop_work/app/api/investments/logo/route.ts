import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { investmentLogoCandidates, investmentLogoInitials } from "@/lib/investments/logo-resolver";

export const runtime = "nodejs";

function svgFallback(initials: string) {
  const safe = initials.replace(/[^A-Z0-9]/gi, "").slice(0, 4) || "AS";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ecfeff"/><stop offset="1" stop-color="#dbeafe"/></linearGradient></defs>
  <rect width="128" height="128" rx="34" fill="url(#g)"/>
  <text x="64" y="72" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="800" fill="#172033">${safe}</text>
</svg>`;
}

async function imageResponse(url: string) {
  const response = await fetch(url, {
    cache: "force-cache",
    next: { revalidate: 60 * 60 * 24 * 7 },
    signal: AbortSignal.timeout(4_000),
    headers: { "User-Agent": "LOOP investment logo resolver/1.0" },
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;
  const body = await response.arrayBuffer();
  if (!body.byteLength) return null;
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const holdingId = request.nextUrl.searchParams.get("holdingId");
  let ticker = request.nextUrl.searchParams.get("ticker");
  let name = request.nextUrl.searchParams.get("name");
  let providerLogoUrl: string | null = null;

  if (holdingId && !holdingId.startsWith("bundle:") && holdingId !== "portfolio-other") {
    const { data } = await supabase
      .from("investment_holdings")
      .select("ticker,asset_name,logo_url,external_position_raw")
      .eq("id", holdingId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      ticker = data.ticker || ticker;
      name = data.asset_name || name;
      const raw: any = data.external_position_raw || {};
      providerLogoUrl = data.logo_url || raw.loop_logo_url || raw.logo_url || raw.logoUrl || raw.symbol?.logo_url || raw.instrument?.logo_url || null;
    }
  }

  const identity = { ticker, name, providerLogoUrl };
  for (const candidate of investmentLogoCandidates(identity)) {
    try {
      const response = await imageResponse(candidate);
      if (response) return response;
    } catch {
      // Continue through the deterministic fallback chain.
    }
  }

  return new NextResponse(svgFallback(investmentLogoInitials(identity)), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
