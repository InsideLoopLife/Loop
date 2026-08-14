// app/api/dashboard-widgets/route.ts
//
// Uses your actual Supabase server helper (createServerDatabaseClient) —
// corrected from an earlier guess.
import { NextRequest, NextResponse } from "next/server";
import { createServerDatabaseClient } from "@/platform/database/server-client";
import type { WidgetConfig } from "@/lib/dashboard/types";
import { getWidgetDefinition } from "@/lib/dashboard/widget-registry";
import { sanitizeWidgetConfig } from "@/lib/dashboard/widget-preferences";

// GET /api/dashboard-widgets — current user's widget layout
export async function GET() {
  const supabase = await createServerDatabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_dashboard_widgets")
    .select("*")
    .eq("user_id", user.id)
    .order("layout_y", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ widgets: data });
}

// POST /api/dashboard-widgets — add a widget instance
export async function POST(req: NextRequest) {
  const supabase = await createServerDatabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { widget_type, household_id, config, layout } = body as {
    widget_type: string;
    household_id: string;
    config?: WidgetConfig;
    layout?: { x: number; y: number; w: number; h: number };
  };

  const definition = getWidgetDefinition(widget_type);
  if (!definition) {
    return NextResponse.json({ error: `Unknown widget type: ${widget_type}` }, { status: 400 });
  }

  const size = layout ?? { x: 0, y: 0, ...definition.defaultSize };

  const { data, error } = await supabase
    .from("user_dashboard_widgets")
    .insert({
      user_id: user.id,
      household_id,
      widget_type,
      config: sanitizeWidgetConfig(config),
      layout_x: size.x,
      layout_y: size.y,
      layout_w: "w" in size ? size.w : definition.defaultSize.w,
      layout_h: "h" in size ? size.h : definition.defaultSize.h,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ widget: data });
}

// PATCH /api/dashboard-widgets — bulk layout update (drag/resize end) or single config update
export async function PATCH(req: NextRequest) {
  const supabase = await createServerDatabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();

  // Bulk layout sync: [{ id, x, y, w, h }, ...] sent once on drag/resize stop
  if (Array.isArray(body.layout)) {
    const updates = body.layout as { id: string; x: number; y: number; w: number; h: number }[];

    const results = await Promise.all(
      updates.map((item) =>
        supabase
          .from("user_dashboard_widgets")
          .update({ layout_x: item.x, layout_y: item.y, layout_w: item.w, layout_h: item.h })
          .eq("id", item.id)
          .eq("user_id", user.id)
      )
    );

    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  // Single widget config update (e.g. changing member scope)
  const { id, config } = body as { id: string; config: WidgetConfig };
  if (!id || typeof id !== "string") return NextResponse.json({ error: "Missing widget id" }, { status: 400 });
  const { data, error } = await supabase
    .from("user_dashboard_widgets")
    .update({ config: sanitizeWidgetConfig(config) })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ widget: data });
}

// DELETE /api/dashboard-widgets?id=...
export async function DELETE(req: NextRequest) {
  const supabase = await createServerDatabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_dashboard_widgets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
