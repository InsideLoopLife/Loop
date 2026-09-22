import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isRouteBootKey,
  sanitizeRouteBootPayload,
} from "@/lib/performance/route-boot";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const routeKey = body?.routeKey;
  const payload = sanitizeRouteBootPayload(body?.payload);

  if (!isRouteBootKey(routeKey) || !payload) {
    return NextResponse.json(
      { ok: false, error: "Invalid snapshot" },
      { status: 400 },
    );
  }

  const { error } = await (supabase as any).rpc("upsert_route_boot_snapshot", {
    p_route_key: routeKey,
    p_payload: payload,
    p_payload_version: 1,
    p_generated_at: new Date().toISOString(),
  });

  if (error) {
    console.warn("[route-boot] snapshot write skipped", {
      routeKey,
      message: error.message,
    });
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
